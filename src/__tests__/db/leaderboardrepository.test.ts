import { describe, test, expect } from 'vitest';
import { mockQuery, setMockIsAvailable } from './__helpers.js';

import { LeaderboardRepository } from '../../db/leaderboardrepository.js';

describe('LeaderboardRepository', () => {

    describe('upsertWordCount', () => {
        test('returns early when DB unavailable', async () => {
            setMockIsAvailable(false);
            await LeaderboardRepository.upsertWordCount('g1', 'user1', 'hello', 5);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with correct SQL and params', async () => {
            await LeaderboardRepository.upsertWordCount('g1', 'user1', 'hello', 5);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO leaderboard_stats'),
                ['g1', 'user1', 'hello', 5]
            );
        });

        test('catches error on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            await expect(LeaderboardRepository.upsertWordCount('g1', 'user1', 'hello', 5)).resolves.toBeUndefined();
        });
    });

    describe('incrementWordCount', () => {
        test('returns early when DB unavailable', async () => {
            setMockIsAvailable(false);
            await LeaderboardRepository.incrementWordCount('g1', 'user1', 'hello');
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with correct SQL and params', async () => {
            await LeaderboardRepository.incrementWordCount('g1', 'user1', 'hello');
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO leaderboard_stats'),
                ['g1', 'user1', 'hello']
            );
        });

        test('catches error on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            await expect(LeaderboardRepository.incrementWordCount('g1', 'user1', 'hello')).resolves.toBeUndefined();
        });
    });

    describe('getLeaderboard', () => {
        test('returns empty array when DB unavailable', async () => {
            setMockIsAvailable(false);
            const result = await LeaderboardRepository.getLeaderboard('g1', 'hello');
            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns rows on success', async () => {
            const rows = [{ user_name: 'user1', count: 10 }, { user_name: 'user2', count: 5 }];
            mockQuery.mockResolvedValueOnce({ rows });
            const result = await LeaderboardRepository.getLeaderboard('g1', 'hello');
            expect(result).toEqual(rows);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT user_name, count FROM leaderboard_stats'),
                ['g1', 'hello']
            );
        });

        test('returns empty array on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            const result = await LeaderboardRepository.getLeaderboard('g1', 'hello');
            expect(result).toEqual([]);
        });
    });

    describe('getUserStats', () => {
        test('returns empty array when DB unavailable', async () => {
            setMockIsAvailable(false);
            const result = await LeaderboardRepository.getUserStats('g1', 'user1');
            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns rows on success', async () => {
            const rows = [{ word: 'hello', count: 10 }, { word: 'world', count: 3 }];
            mockQuery.mockResolvedValueOnce({ rows });
            const result = await LeaderboardRepository.getUserStats('g1', 'user1');
            expect(result).toEqual(rows);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT word, count FROM leaderboard_stats'),
                ['g1', 'user1']
            );
        });

        test('returns empty array on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            const result = await LeaderboardRepository.getUserStats('g1', 'user1');
            expect(result).toEqual([]);
        });
    });

    describe('bulkUpsert', () => {
        test('returns early when DB unavailable', async () => {
            setMockIsAvailable(false);
            await LeaderboardRepository.bulkUpsert([{ guildId: 'g1', userName: 'u1', word: 'w', count: 1 }]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns early for empty rows', async () => {
            await LeaderboardRepository.bulkUpsert([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with correct params for a single batch', async () => {
            const rows = [
                { guildId: 'g1', userName: 'u1', word: 'hello', count: 5 },
                { guildId: 'g1', userName: 'u2', word: 'world', count: 3 },
            ];
            await LeaderboardRepository.bulkUpsert(rows);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO leaderboard_stats'),
                ['g1', 'u1', 'hello', 5, 'g1', 'u2', 'world', 3]
            );
        });

        test('batches rows in groups of 100', async () => {
            const rows = Array.from({ length: 150 }, (_, i) => ({
                guildId: 'g1',
                userName: `u${i}`,
                word: 'w',
                count: i,
            }));
            await LeaderboardRepository.bulkUpsert(rows);
            expect(mockQuery).toHaveBeenCalledTimes(2);
        });

        test('catches error on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            await expect(
                LeaderboardRepository.bulkUpsert([{ guildId: 'g1', userName: 'u1', word: 'w', count: 1 }])
            ).resolves.toBeUndefined();
        });
    });

    describe('getAllForGuild', () => {
        test('returns empty array when DB unavailable', async () => {
            setMockIsAvailable(false);
            const result = await LeaderboardRepository.getAllForGuild('g1');
            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns rows on success', async () => {
            const rows = [{ user_name: 'u1', word: 'hello', count: 10 }];
            mockQuery.mockResolvedValueOnce({ rows });
            const result = await LeaderboardRepository.getAllForGuild('g1');
            expect(result).toEqual(rows);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT user_name, word, count FROM leaderboard_stats'),
                ['g1']
            );
        });

        test('returns empty array on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            const result = await LeaderboardRepository.getAllForGuild('g1');
            expect(result).toEqual([]);
        });
    });

});
