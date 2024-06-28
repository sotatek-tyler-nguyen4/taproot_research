import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { tapTreeToList, toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import * as bip32 from "bip32";
import { regtestUtils } from "./_regtest";
import accumulative from "coinselect/accumulative";
const regtest = regtestUtils.network;

declare type Witness = {
  value: number;
  script: Buffer;
};

declare type UTXO = {
  hash: string;
  index: number;
  value: number;
  witnessUtxo: Witness;
  txHex: string;
};

async function main() {
  const internalKey = bip32.fromSeed(
    Buffer.from(
      "cdd0f23a07581c855b4fdf9abbbe07bab30cfc87012d5b4a2399704dbcb371dc82a978aa177320ae881f894b790de5e29f3965f67b64d8c9e324f6eb913fe669",
      "hex"
    ),
    regtest
  );

  const p2pkhTx = bitcoin.payments.p2pkh({
    pubkey: internalKey.publicKey,
    network: regtest,
  });
  await regtestUtils.faucetComplex(p2pkhTx.output!, 2000);
  const unspents = await regtestUtils.unspents(p2pkhTx.address!); // dust
  console.log("🚀 ~ main ~ unspents:", unspents);
  const utxos: UTXO[] = await Promise.all(
    unspents.map(async (unspent) => {
      const fetchTx = await regtestUtils.fetch(unspent.txId);
      return {
        hash: unspent.txId,
        index: unspent.vout,
        value: unspent.value,
        witnessUtxo: {
          value: unspent.value,
          script: Buffer.from(fetchTx.outs[unspent.vout].script, "hex"),
        },
        txHex: fetchTx.txHex,
      };
    })
  );
  console.log("🚀 ~ main ~ utxos:", utxos);
  const outputTarget = [{ address: regtestUtils.randomAddress(), value: 1500 }]; // Change output value to test
  const { inputs, outputs, fee } = accumulative(utxos, outputTarget, 3); // 3sat/vB
  console.log("🚀 ~ main ~ output:", outputs);
  console.log("🚀 ~ main ~ input:", inputs);
  console.log("🚀 ~ main ~ fee:", fee);
  //   const fetchFaucetTx = await regtestUtils.fetch(unspents[0].txId);
  //   console.log("🚀 ~ main ~ fetchFaucetTx:", fetchFaucetTx);
  //   const psbt = new bitcoin.Psbt({ network: regtest });
  //   psbt.addInput({
  //     index: 0,
  //     hash: unspents[0].txId,
  //     nonWitnessUtxo: Buffer.from(fetchFaucetTx.txHex, "hex"),
  //   });
  //   psbt.addOutput({ value: 546, address: p2pkhTx.address! });
  //   psbt.addOutput({
  //     value: fetchFaucetTx.outs[0].value - 1000,
  //     address: regtestUtils.randomAddress(),
  //   });
}

main();
