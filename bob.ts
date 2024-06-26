import * as bitcoin from "bitcoinjs-lib";
import * as bip32 from "bip32";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { regtestUtils } from "./_regtest";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils";
import { ECPairFactory } from "ecpair";
const ECPair = ECPairFactory(ecc);

const rng = require("randombytes");
const regtest = regtestUtils.network;
bitcoin.initEccLib(ecc);
const { witnessStackToScriptWitness } = psbtUtils;

const txs: Map<string, bitcoin.Transaction> = new Map();

async function main() {
  const network = bitcoin.networks.testnet;
  const seed = await bip39.mnemonicToSeed("YOUR SEED PHRASE", "");
  const derivation = "m/84'/1'/0'/0/0";
  const root = bip32.fromSeed(seed);
  const master = root.derivePath(derivation);

  const internalKey = ECPair.fromWIF(master.toWIF());
  const { address: p2wpkhAddress } = bitcoin.payments.p2wpkh({
    pubkey: internalKey.publicKey,
    network,
  });
  console.log("🚀 ~ main ~ p2wpkhAddress:", p2wpkhAddress);

  const feeRate = 100;
  const amount = 546;

  // ====== create commit data =================
  const maker = Buffer.from("ord");
  const mimetype = Buffer.from("text/plain;charset=utf-8");
  const brc20Data = Buffer.from(
    JSON.stringify({
      p: "brc-20",
      op: "deploy",
      tick: "tyler",
      max: "21000000",
      lim: "1000",
    })
  );
  const script = [
    toXOnly(internalKey.publicKey),
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_0,
    bitcoin.opcodes.OP_IF,
    maker,
    Buffer.from("01", "hex"),
    mimetype,
    bitcoin.opcodes.OP_0,
    brc20Data,
    bitcoin.opcodes.OP_ENDIF,
  ];
  const outScript = bitcoin.script.compile(script);
  const scriptTree = {
    output: outScript,
    redeemVersion: 192,
  };
  const scriptTaproot = bitcoin.payments.p2tr({
    internalPubkey: toXOnly(internalKey.publicKey),
    scriptTree,
    redeem: scriptTree,
    network,
  });

  const cblock = scriptTaproot.witness?.[scriptTaproot.witness.length - 1];
  const tapLeafScript = {
    leafVersion: scriptTaproot.redeemVersion!,
    script: outScript,
    controlBlock: cblock!,
  };

  // =============================Estimate Reveal Tx Size====================================
  const customFinalizer = () => {
    return (inputIndex: number, input: any) => {
      const witness = [input.tapScriptSig[inputIndex].signature]
        .concat(tapLeafScript.script)
        .concat(tapLeafScript.controlBlock);

      return {
        finalScriptWitness: witnessStackToScriptWitness(witness),
      };
    };
  };
  const psbt = new bitcoin.Psbt({ network });
  psbt.addInput({
    hash: Buffer.alloc(32, 0),
    index: 0,
    witnessUtxo: {
      value: amount,
      script: scriptTaproot.output!,
    },
    tapLeafScript: [tapLeafScript],
  });

  psbt.addOutput({ value: amount, address: scriptTaproot.address! });
  psbt.signInput(0, internalKey);
  psbt.finalizeInput(0, customFinalizer());
  const tx = psbt.extractTransaction();
  const revealTxSize = tx.virtualSize();
  console.log("🚀 ~ main ~ revealTxSize:", revealTxSize);
  const revealFee = revealTxSize * feeRate;
  console.log("🚀 ~ main ~ revealFee:", revealFee);

  // =============================CREATE COMMIT TX====================================
  const sendToAddress = async (
    toAddress: string,
    amount: number
  ): Promise<string> => {
    console.log("🚀 ~ main ~ amount:", amount);
    console.log("🚀 ~ main ~ toAddress:", toAddress);
    // const tx = await regtestUtils.faucetComplex(
    //   bitcoin.address.toOutputScript(toAddress, network),
    //   amount
    // );
    // const txId = tx.txId;
    // const fetchTx = await regtestUtils.fetch(txId);
    // const tx = new bitcoin.Transaction();
    // tx.addInput(
    //   Buffer.from(
    //     "ef48e417a90accc540387c6339d6065976f94db772a91b5dfdb9d5de177224ab",
    //     "hex"
    //   ),
    //   0
    // );
    // tx.addOutput(bitcoin.address.toOutputScript(toAddress, network), amount);
    const pbstCommit = new bitcoin.Psbt({ network });
    pbstCommit.addInput({
      hash: "ef48e417a90accc540387c6339d6065976f94db772a91b5dfdb9d5de177224ab", // UTXO hash
      index: 0,
      // UTXO tx hex
      nonWitnessUtxo: Buffer.from(
        "02000000000101ee9dc17fc8602d9dfc06c073123080bb7fe6a5b057855127488c9a46a84e65680000000000fdffffff020b5e0000000000001600140670e00dce47679060fdc81d1294cc8fdd86ec22b8d8d40f00000000160014b9f3485c06b1cc7d514d308c5e609697fa8a3d6c02473044022027d8d7e9139cad7c9d8417cafdfb367035149e1d7080490f2c013c2a54566175022079fc7c873e2216b253daae3a96587b76482de12a2f6a8f145726a1e034648910012103d5effe14869d0af1ea89600c9b0ebc871bdab6d17ac81aff1c776beef94efdbfcf0e2b00",
        "hex"
      ),
    });
    pbstCommit.addOutput({ address: toAddress, value: amount });
    pbstCommit.signInput(0, internalKey);
    pbstCommit.finalizeAllInputs();
    const tx = pbstCommit.extractTransaction();
    console.log("🚀 ~ main ~ commitTx:", tx.toHex());
    const txId = tx.getId();
    txs.set(txId, tx);
    return txId;
  };

  const commitTxAmount = revealFee > 0 ? revealFee + amount : amount + 155;
  console.log("🚀 ~ main ~ commitTxAmount:", commitTxAmount);
  const commitAddress = scriptTaproot.address!;
  const commitTxId = await sendToAddress(commitAddress, commitTxAmount);
  const commitTx = txs.get(commitTxId)!;

  const scriptPubKey = bitcoin.address.toOutputScript(commitAddress, network);
  const commitUtxoIndex = commitTx.outs.findIndex((out) =>
    out.script.equals(scriptPubKey)
  );
  const commitTxResult = {
    tx: commitTx,
    outputIndex: commitUtxoIndex,
    outputAmount: commitTxAmount,
  };

  // =============================CREATE REVEAL TX====================================
  const revealPsbt = new bitcoin.Psbt({ network });
  revealPsbt.addInput({
    hash: commitTxResult.tx.getId(),
    index: commitTxResult.outputIndex,
    witnessUtxo: {
      value: commitTxResult.outputAmount,
      script: scriptTaproot.output!,
    },
    nonWitnessUtxo: commitTxResult.tx.toBuffer(),
    tapLeafScript: [tapLeafScript],
  });

  revealPsbt.addOutput({
    value: amount,
    address: commitAddress,
  });

  revealPsbt.signInput(0, internalKey);
  revealPsbt.finalizeInput(0, customFinalizer());
  const revealTx = revealPsbt.extractTransaction();
  console.log("🚀 ~ main ~ revealTx:", revealTx.toHex());
  // regtestUtils.broadcast(revealTx.toBuffer().toString("hex"));
  // const executedRevealTx = await regtestUtils.fetch(revealTx.getId());
  // console.log("🚀 ~ main ~ executedRevealTx:", executedRevealTx.txHex);
  // console.log("🚀 ~ main ~ executedRevealTx:", executedRevealTx);
}

main();
