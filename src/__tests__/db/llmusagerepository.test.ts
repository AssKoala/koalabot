import { describe, test, expect } from 'vitest';
import { mockQuery, setMockIsAvailable } from './__helpers.js';

import { LLMUsageRepository } from '../../db/llmusagerepository.js';

describe('LLMUsageRepository', () => {
    describe('insert()', () => {
        test('returns early when DB is unavailable', async () => {
            setMockIsAvailable(false);
            await LLMUsageRepository.insert('guild1', 'user1', 'Alice', 'openai', 'gpt-4', 100, 50, 200);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with all params and Math.round on latencyMs', async () => {
            await LLMUsageRepository.insert('guild1', 'user1', 'Alice', 'openai', 'gpt-4', 100, 50, 203.8);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO llm_usage'),
                ['guild1', 'user1', 'Alice', 'openai', 'gpt-4', 100, 50, 204]
            );
        });

        test('accepts null tokens', async () => {
            await LLMUsageRepository.insert('guild1', 'user1', 'Alice', 'gemini', 'gemini-pro', null, null, 150);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO llm_usage'),
                ['guild1', 'user1', 'Alice', 'gemini', 'gemini-pro', null, null, 150]
            );
        });

        test('logs error on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('connection lost'));
            await expect(
                LLMUsageRepository.insert('g', 'u', 'n', 'p', 'm', 1, 1, 1)
            ).resolves.toBeUndefined();
        });
    });
});
