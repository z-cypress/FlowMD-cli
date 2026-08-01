/**
 * vitest 全局 setup
 * 强制测试环境使用中文语言包，保证现有中文断言稳定
 */

import { beforeEach, afterEach } from 'vitest';
import { setLang } from '../utils/i18n.js';

beforeEach(() => {
  setLang('zh');
});

afterEach(() => {
  setLang(null);
});
