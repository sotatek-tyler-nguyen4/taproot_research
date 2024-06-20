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
      "483045022100cdab1e5ce1cfd0a4649fd5aa8194d3ec2760d4ff6e0d790b0f7e97e5003a63a40220196cf437fecaf40e176aae0a7610d344f60bb47270908d5bcccbdf718672dc85012103320d3e5bbaa4ed30ee821f3556e60d2cb32ffcc65ca0ec2f0e078800dc9dada4",
      "hex"
    )
  )
);
