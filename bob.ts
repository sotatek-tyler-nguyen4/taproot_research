import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { regtestUtils } from "./_regtest";
import { tapTreeToList, toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils";
import coininfo from "coininfo";

const rng = require("randombytes");
const regtest = regtestUtils.network;
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const { witnessStackToScriptWitness } = psbtUtils;

const txs: Map<string, bitcoin.Transaction> = new Map();

async function main() {
  const internalKey = bip32.fromSeed(
    Buffer.from(
      "cdd0f23a07581c855b4fdf9abbbe07bab30cfc87012d5b4a2399704dbcb371dc82a978aa177320ae881f894b790de5e29f3965f67b64d8c9e324f6eb913fe669",
      "hex"
    ),
    regtest
  );
  const amount = 546;
  const postage = 1000;
  const feeRate = new bitcoin.Psbt({ network: regtest }).getFeeRate();
  console.log("🚀 ~ main ~ feeRate:", feeRate);

  // ====== create commit data =================
  const maker = Buffer.from("ord");
  const mimetype = Buffer.from("text/plain;charset=utf-8");
  const brc20Data = Buffer.from(
    JSON.stringify({
      p: "brc-20",
      op: "deploy",
      tick: "trac",
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
    network: regtest,
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
  const psbt = new bitcoin.Psbt({ network: regtest });
  psbt.addInput({
    hash: Buffer.alloc(32, 0),
    index: 0,
    witnessUtxo: {
      value: postage,
      script: scriptTaproot.output!,
    },
    tapLeafScript: [tapLeafScript],
  });

  psbt.addOutput({ value: postage, address: scriptTaproot.address! });
  psbt.signInput(0, internalKey);
  psbt.finalizeInput(0, customFinalizer());
  const tx = psbt.extractTransaction();
  const revealTxSize = tx.virtualSize();
  console.log("🚀 ~ main ~ revealTxSize:", tx);
  console.log("🚀 ~ main ~ revealTxSize:", revealTxSize);
  const revealFee = revealTxSize * feeRate;
  console.log("🚀 ~ main ~ revealFee:", revealFee);

  // =============================CREATE COMMIT TX====================================
  const sendToAddress = async (
    toAddress: string,
    amount: number
  ): Promise<string> => {
    const tx = await regtestUtils.faucetComplex(
      bitcoin.address.toOutputScript(toAddress, regtest),
      amount
    );
    const txId = tx.txId;
    const fetchTx = await regtestUtils.fetch(txId);
    // const tx = new bitcoin.Transaction();
    // tx.addInput(Buffer.alloc(32, 0), 0);
    // tx.addOutput(bitcoin.address.toOutputScript(toAddress, regtest), amount);
    // const txId = tx.getId();
    txs.set(txId, bitcoin.Transaction.fromHex(fetchTx.txHex));
    return txId;
  };

  const commitTxAmount = revealFee * postage > 0 ? revealFee * postage : amount + 155;
  console.log("🚀 ~ main ~ commitTxAmount:", commitTxAmount);
  const commitAddress = scriptTaproot.address!;
  const commitTxId = await sendToAddress(commitAddress, commitTxAmount);
  const commitTx = txs.get(commitTxId)!;

  const scriptPubKey = bitcoin.address.toOutputScript(commitAddress, regtest);
  const commitUtxoIndex = commitTx.outs.findIndex((out) =>
    out.script.equals(scriptPubKey)
  );
  const commitTxResult = {
    tx: commitTx,
    outputIndex: commitUtxoIndex,
    outputAmount: commitTxAmount,
  };

  // =============================CREATE REVEAL TX====================================
  const revealPsbt = new bitcoin.Psbt({ network: regtest });
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
  console.log(
    "🚀 ~ main ~ revealTx:",
    revealTx.ins[0].witness[1].toString("hex")
  );
  console.log("🚀 ~ main ~ revealTx:", revealTx);
  regtestUtils.broadcast(revealTx.toBuffer().toString("hex"));
  const executedRevealTx = await regtestUtils.fetch(revealTx.getId());
  console.log("🚀 ~ main ~ executedRevealTx:", executedRevealTx.txHex)
  console.log("🚀 ~ main ~ executedRevealTx:", executedRevealTx)
}

main();
