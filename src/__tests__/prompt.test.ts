/**
 * Prompt utility unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askQuestion, confirm } from '../utils/prompt.js';

const mockQuestion = vi.hoisted(() => vi.fn());

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: vi.fn(),
  })),
}));

describe('askQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve with user input', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('my answer');
    });

    const answer = await askQuestion('What?');
    expect(answer).toBe('my answer');
  });

  it('should resolve empty string for blank input', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('');
    });

    const answer = await askQuestion('Empty?');
    expect(answer).toBe('');
  });

  it('should pass the question text to readline', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('x');
    });

    await askQuestion('Enter name:');
    expect(mockQuestion).toHaveBeenCalledWith('Enter name:', expect.any(Function));
  });
});

describe('confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for "y"', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('y');
    });

    await expect(confirm('Proceed?')).resolves.toBe(true);
  });

  it('should return true for "Y" (case insensitive)', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('Y');
    });

    await expect(confirm('Proceed?')).resolves.toBe(true);
  });

  it('should return false for "n"', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('n');
    });

    await expect(confirm('Proceed?')).resolves.toBe(false);
  });

  it('should return false for empty input', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('');
    });

    await expect(confirm('Proceed?')).resolves.toBe(false);
  });

  it('should append "(y/N)" to the message', async () => {
    mockQuestion.mockImplementationOnce((_q: string, cb: (a: string) => void) => {
      cb('y');
    });

    await confirm('Overwrite?');
    expect(mockQuestion).toHaveBeenCalledWith('Overwrite? (y/N) ', expect.any(Function));
  });
});
