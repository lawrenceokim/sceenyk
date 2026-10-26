// Local synthetic image fixture only. No storage, jobs or provider requests.
import assert from "node:assert/strict";
import sharp from "sharp";
import { maskV5Front } from "../lib/character-v5/front-concealment";
import { technicalPng, v5OutputProof } from "../lib/character-v5/storage";
async function main() {
  let checks = 0;
  const width = 256; const height = 512; const maskTop = 2500; const boundary = 128;
  const original = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    original[offset] = y < boundary ? 255 : x % 251;
    original[offset + 1] = y % 251;
    original[offset + 2] = y >= height - 30 ? 255 : 20;
  }
  const png = await sharp(original, { raw: { width, height, channels: 3 } }).png().toBuffer();
  // New provider-final Front bypasses historical mask/crop processing. Distinct
  // top and bottom pixels stand in for shoulders and footwear at the edges.
  const finalFront = await technicalPng(png);
  const finalPixels = await sharp(finalFront).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(finalPixels.info.width, width); assert.equal(finalPixels.info.height, height); checks++;
  assert.deepEqual(finalPixels.data, original); checks++;
  const proof = await v5OutputProof("11111111-1111-4111-8111-111111111111", finalFront);
  assert.equal(proof.width, width); assert.equal(proof.height, height); checks++;
  const unchanged = Buffer.from(png);
  const masked = await maskV5Front(png, maskTop);
  const pixels = await sharp(masked).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(pixels.info.width, width); assert.equal(pixels.info.height, height); checks++;
  assert(pixels.data.subarray(0, width * boundary * 3).every(value => value === 184)); checks++;
  assert.deepEqual(pixels.data.subarray(width * boundary * 3), original.subarray(width * boundary * 3)); checks++;
  assert.deepEqual(png, unchanged); checks++;
  assert.deepEqual(await maskV5Front(png, maskTop), masked); checks++;
  // Masking a smaller area from the retained source restores the original pixels;
  // preview adjustment never operates on an already-masked or cropped image.
  const adjusted = await sharp(await maskV5Front(png, 1000)).removeAlpha().raw().toBuffer();
  const adjustedBoundary = Math.ceil(height * 1000 / 10000);
  assert.deepEqual(adjusted.subarray(width * adjustedBoundary * 3), original.subarray(width * adjustedBoundary * 3)); checks++;
  for (const invalid of [0, 499, 6001, 1500.5, NaN]) {
    await assert.rejects(maskV5Front(png, invalid), { code: "CHARACTER_FRONT_MASK_INVALID" }); checks++;
  }
  console.info(JSON.stringify({ checks, providerCalls: 0, storageCalls: 0, fixtureOnly: true }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
