import { bundle } from '@remotion/bundler';
import { renderFrames, selectComposition, renderStill } from '@remotion/renderer';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve('.reports/remotion-spike');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function runCommand(command: string, desc: string): number {
  console.log(`\n--- Running ${desc} ---`);
  const start = performance.now();
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (e) {
    console.error(`Command failed: ${command}`);
    throw e;
  }
  const end = performance.now();
  const durationMs = end - start;
  console.log(`Done in ${(durationMs / 1000).toFixed(2)}s`);
  return durationMs;
}

function getFFprobeData(filePath: string) {
  const ffprobeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -show_entries format=duration -of json "${filePath}"`;
  const output = execSync(ffprobeCommand).toString();
  return JSON.parse(output);
}

function getFileSizeMB(filePath: string) {
  return (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2) + ' MB';
}

async function renderRemotionAPI(id: string, outPath: string, type: 'video' | 'still') {
  const start = performance.now();
  console.log(`\n--- Running Remotion API ${type} for ${id} ---`);

  // 1. Bundle
  const bundled = await bundle({
    entryPoint: path.resolve('src/experimental/remotion/index.ts'),
    publicDir: path.resolve('src/experimental/remotion/public'),
  });

  // 2. Select Composition
  const composition = await selectComposition({
    serveUrl: bundled,
    id,
  });

  // 3. Render
  if (type === 'video') {
    const framesDir = outPath.replace('.mp4', '-frames');
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

    await renderFrames({
      composition,
      serveUrl: bundled,
      outputDir: framesDir,
      imageFormat: 'png',
      concurrency: 1, // Minimize crash risk
      inputProps: {},
      onStart: () => {},
      onFrameUpdate: () => {},
    });

    // Manually stitch using FFmpeg to bypass Node.js EPIPE on Windows
    execSync(`ffmpeg -y -framerate 30 -i "${framesDir}/element-%03d.png" -c:v libx264 -pix_fmt yuv420p "${outPath}"`);
  } else {
    await renderStill({
      composition,
      serveUrl: bundled,
      output: outPath,
      frame: 30,
      imageFormat: 'png',
    });
  }

  const end = performance.now();
  const durationMs = end - start;
  console.log(`Done in ${(durationMs / 1000).toFixed(2)}s`);
  return durationMs;
}

async function main() {
  console.log('Starting Remotion vs FFmpeg Feasibility Spike...');

  // 1. Remotion Render 16:9
  const remotion16x9Time = await renderRemotionAPI(
    'SpikeAnimatic16x9',
    path.resolve('.reports/remotion-spike/16x9.mp4'),
    'video'
  );

  // 2. Remotion Render 9:16
  const remotion9x16Time = await renderRemotionAPI(
    'SpikeAnimatic9x16',
    path.resolve('.reports/remotion-spike/9x16.mp4'),
    'video'
  );

  // 3. Remotion Still
  await renderRemotionAPI(
    'SpikeAnimatic16x9',
    path.resolve('.reports/remotion-spike/thumbnail.png'),
    'still'
  );

  // 4. Baseline FFmpeg
  const img1 = path.resolve('src/experimental/remotion/public/shot.jpg').replace(/\\/g, '/');
  const audio = path.resolve('src/experimental/remotion/public/mock-voice.wav').replace(/\\/g, '/');
  const ffmpegCommand = `ffmpeg -y -loop 1 -t 2 -i "${img1}" -loop 1 -t 3 -i "${img1}" -loop 1 -t 2 -i "${img1}" -i "${audio}" -filter_complex "[0:v]scale=1920:1080[v0];[1:v]scale=1920:1080[v1];[2:v]scale=1920:1080[v2];[v0][v1][v2]concat=n=3:v=1:a=0[outv]" -map "[outv]" -map 3:a -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest .reports/remotion-spike/ffmpeg_baseline.mp4`;
  const ffmpegTime = runCommand(ffmpegCommand, 'FFmpeg Baseline 16:9');

  console.log('\n--- Results ---');

  const mp416x9 = getFFprobeData('.reports/remotion-spike/16x9.mp4');
  console.log('Remotion 16:9:', mp416x9.streams[0].width + 'x' + mp416x9.streams[0].height, 'FPS:', mp416x9.streams[0].avg_frame_rate, 'Duration:', mp416x9.format.duration, 'Size:', getFileSizeMB('.reports/remotion-spike/16x9.mp4'));

  const mp49x16 = getFFprobeData('.reports/remotion-spike/9x16.mp4');
  console.log('Remotion 9:16:', mp49x16.streams[0].width + 'x' + mp49x16.streams[0].height, 'FPS:', mp49x16.streams[0].avg_frame_rate, 'Duration:', mp49x16.format.duration, 'Size:', getFileSizeMB('.reports/remotion-spike/9x16.mp4'));

  console.log(`\\nRender Time Comparison:`);
  console.log(`Remotion 16:9: ${(remotion16x9Time / 1000).toFixed(2)}s`);
  console.log(`FFmpeg 16:9:   ${(ffmpegTime / 1000).toFixed(2)}s`);
}

main().catch(console.error);
