import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { regtestUtils } from "./_regtest";
import { tapTreeToList, toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import coininfo from "coininfo";

const rng = require("randombytes");
const regtest = regtestUtils.network;
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

async function main() {
  const internalKey = bip32.fromSeed(
    Buffer.from(
      "cdd0f23a07581c855b4fdf9abbbe07bab30cfc87012d5b4a2399704dbcb371dc82a978aa177320ae881f894b790de5e29f3965f67b64d8c9e324f6eb913fe669",
      "hex"
    ),
    regtest
  );

  const maker = Buffer.from("ord").toString("hex");
  const mimetype = Buffer.from("text/plain;charset=utf-8").toString("hex");
  const brc20Data = Buffer.from(
    JSON.stringify({
      p: "brc-20",
      op: "deploy",
      tick: "trac",
      max: "21000000",
      lim: "1000",
    })
  ).toString("hex");

  const leafScriptAsm = `${toXOnly(internalKey.publicKey).toString(
    "hex"
  )} OP_CHECKSIG OP_0 OP_IF ${maker} 01 ${mimetype} OP_0 ${brc20Data} OP_ENDIF`;
  const leafScript = bitcoin.script.fromASM(leafScriptAsm);
  const scriptTree = {
    output: leafScript,
    redeemVersion: 192,
  };
  
  // =============================FAUCET====================================
  // amount from faucet
  const amount = 42e4;
  // amount to send
  const sendAmount = amount - 10e4;
  const p2pkh = bitcoin.payments.p2pkh({
    pubkey: internalKey.publicKey,
    network: regtest,
  });
  const unspent = await regtestUtils.faucetComplex(p2pkh.output!, amount);
  const fetchFaucetTx = await regtestUtils.fetch(unspent.txId);
  console.log("🚀 ~ main ~ fetchFaucetTx:", fetchFaucetTx.txHex);

  // =============================TAPROOT====================================
  const { output, address, witness, redeemVersion, redeem } =
  bitcoin.payments.p2tr({
    internalPubkey: toXOnly(internalKey.publicKey),
    scriptTree,
    redeem: scriptTree,
    network: regtest,
  });
  console.log("🚀 ~ main ~ witness:", { output, address, witness, redeemVersion, redeem })
  const psbt = new bitcoin.Psbt({ network: regtest });
  psbt.addInput({ index: 0, hash: unspent.txId, nonWitnessUtxo: Buffer.from(fetchFaucetTx.txHex, 'hex')});
  psbt.addOutput({ value: sendAmount, address: address! });
  psbt.updateOutput(0,{
    tapInternalKey: toXOnly(internalKey.publicKey),
    tapTree: { leaves: tapTreeToList(scriptTree)}
  });

  psbt.signInput(0, internalKey);

  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  const rawTx = tx.toBuffer();

  const hex = rawTx.toString("hex");

  await regtestUtils.broadcast(hex);
  console.log("🚀 ~ main ~ hex:", hex);
  const fetchTx = await regtestUtils.fetch(tx.getId());
  console.log("🚀 ~ main ~ fetchTx:", fetchTx.txHex, fetchTx.ins, fetchTx.outs);
}

main();
