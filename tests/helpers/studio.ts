/**
 * Test harness: a throwaway SQLite database + storage root per suite, wired
 * into the real container. Tests exercise the same code the app runs — nothing
 * is mocked except the environment that points at temporary directories.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '@/infrastructure/db/client';
import { resetStudio } from '@/infrastructure/container';

export interface TestEnv {
  root: string;
  cleanup(): void;
}

export function useTempStudio(name: string): TestEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `dtstudio-${name}-`));
  process.env.DATABASE_URL = path.join(root, 'test.db');
  process.env.STORAGE_LOCAL_ROOT = path.join(root, 'storage');
  process.env.AI_TEXT_PROVIDER = 'mock';
  process.env.AI_IMAGE_PROVIDER = 'mock';
  process.env.AI_VIDEO_PROVIDER = 'mock';
  process.env.AI_VOICE_PROVIDER = 'mock';
  process.env.GOOGLE_API_KEY = '';
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';

  return {
    root,
    cleanup(): void {
      // Drop the memoised Studio *before* closing the connection it wraps, so
      // a later test file's getStudio() rebuilds from scratch instead of
      // inheriting repositories bound to a closed db. Then release the SQLite
      // handle (plus its -wal and -shm files) — Windows refuses to unlink a
      // file that is still open.
      resetStudio();
      closeDb();
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}

export const DEMO_SCRIPT = `CẢNH 1 - HANG ĐỘNG TU TIÊN - ĐÊM

Tinh thể xanh lam hắt sáng lên bệ thiền nứt nẻ. Triệu Ngốc ngồi khoanh chân, cố nhập định.

TRIỆU NGỐC (bực bội): Ta là thiên tài tu tiên.

LƯ SƯ MUỘI: Muội đã ghi vào sổ.

CẢNH 2 - SÂN LUYỆN VÕ - SÁNG

Sương đọng trên phiến đá. Triệu Ngốc rút mộc kiếm ra khỏi vỏ và vung lên.

LƯ SƯ MUỘI: Kiếm lại bay khỏi tay lần thứ mười một.

CẢNH 3 - HANG ĐỘNG TU TIÊN - ĐÊM

Triệu Ngốc mở quyển sổ, đọc từng dòng thất bại, rồi bật cười.

TRIỆU NGỐC: Vậy lần thứ bốn mươi ba thì sao.
`;
