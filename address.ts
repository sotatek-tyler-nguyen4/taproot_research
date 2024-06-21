import * as bitcoin from "bitcoinjs-lib";

import BIP32Factory from "bip32";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";

const rng = require("randombytes");
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

console.log(
  bitcoin.script.toASM(
    Buffer.from(
      "20320d3e5bbaa4ed30ee821f3556e60d2cb32ffcc65ca0ec2f0e078800dc9dada4ac0063036f72645118746578742f706c61696e3b636861727365743d7574662d3800487b2270223a226272632d3230222c226f70223a226465706c6f79222c227469636b223a2274726163222c226d6178223a223231303030303030222c226c696d223a2231303030227d68",
      "hex"
    )
  )
);
