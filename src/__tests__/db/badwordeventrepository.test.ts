import { vi, describe, test, expect, beforeEach } from 'vitest';
import { mockQuery, mockConnect, setMockIsAvailable } from './__helpers.js';

import { BadWordEventRepository } from '../../db/badwordeventrepository.js';

describe('BadWordEventRepository', () => {

    describe('insert', () => {
        test('returns early when DB unavailable', async () => {
            setMockIsAvailable(false);
            await BadWordEventRepository.insert('ch1', 'badword', 'uid1', 'user1', 12345);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with correct SQL and params', async () => {
            await BadWordEventRepository.insert('ch1', 'badword', 'uid1', 'user1', 12345);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO badword_events'),
                ['ch1', 'badword', 'uid1', 'user1', 12345]
            );
        });

        test('catches error on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            await expect(
                BadWordEventRepository.insert('ch1', 'badword', 'uid1', 'user1', 12345)
            ).resolves.toBeUndefined();
        });
    });

    describe('getEvents', () => {
        test('returns empty array when DB unavailable', async () => {
            setMockIsAvailable(false);
            const result = await BadWordEventRepository.getEvents('ch1', 'badword');
            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns rows on success', async () => {
            const rows = [
                { id: 1, channel_id: 'ch1', badword: 'badword', user_id: 'uid1', user_name: 'user1', timestamp: 12345 },
                { id: 2, channel_id: 'ch1', badword: 'badword', user_id: 'uid2', user_name: 'user2', timestamp: 12346 },
            ];
            mockQuery.mockResolvedValueOnce({ rows });
            const result = await BadWordEventRepository.getEvents('ch1', 'badword');
            expect(result).toEqual(rows);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id, channel_id, badword, user_id, user_name, timestamp'),
                ['ch1', 'badword']
            );
        });

        test('returns empty array on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            const result = await BadWordEventRepository.getEvents('ch1', 'badword');
            expect(result).toEqual([]);
        });
    });

    describe('bulkInsert', () => {
        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn(),
        };

        beforeEach(() => {
            mockClient.query.mockReset().mockResolvedValue({ rows: [] });
            mockClient.release.mockReset();
            mockConnect.mockResolvedValue(mockClient);
        });

        test('returns early when DB unavailable', async () => {
            setMockIsAvailable(false);
            await BadWordEventRepository.bulkInsert([
                { channelId: 'ch1', badword: 'bw', userId: 'u1', userName: 'user1', timestamp: 1 },
            ]);
            expect(mockConnect).not.toHaveBeenCalled();
        });

        test('returns early for empty events array', async () => {
            await BadWordEventRepository.bulkInsert([]);
            expect(mockConnect).not.toHaveBeenCalled();
        });

        test('uses transaction with BEGIN and COMMIT on success', async () => {
            const events = [
                { channelId: 'ch1', badword: 'bw', userId: 'u1', userName: 'user1', timestamp: 100 },
                { channelId: 'ch1', badword: 'bw', userId: 'u2', userName: 'user2', timestamp: 200 },
            ];
            await BadWordEventRepository.bulkInsert(events);
            expect(mockConnect).toHaveBeenCalledOnce();
            const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls[0]).toBe('BEGIN');
            expect(calls[1]).toContain('INSERT INTO badword_events');
            expect(calls[1]).toContain('ON CONFLICT ON CONSTRAINT uq_badword_event DO NOTHING');
            expect(calls[2]).toBe('COMMIT');
            expect(mockClient.release).toHaveBeenCalledOnce();
        });

        test('rolls back on query failure and releases client', async () => {
            mockClient.query
                .mockResolvedValueOnce({ rows: [] })  // BEGIN
                .mockRejectedValueOnce(new Error('insert failed'));  // INSERT fails
            // ROLLBACK will use the default mockResolvedValue

            const events = [
                { channelId: 'ch1', badword: 'bw', userId: 'u1', userName: 'user1', timestamp: 100 },
            ];
            await BadWordEventRepository.bulkInsert(events);

            const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls[0]).toBe('BEGIN');
            expect(calls[2]).toBe('ROLLBACK');
            expect(mockClient.release).toHaveBeenCalledOnce();
        });

        test('always releases client even on error', async () => {
            mockClient.query
                .mockResolvedValueOnce({ rows: [] })  // BEGIN
                .mockRejectedValueOnce(new Error('fail'));  // INSERT fails

            await BadWordEventRepository.bulkInsert([
                { channelId: 'ch1', badword: 'bw', userId: 'u1', userName: 'user1', timestamp: 1 },
            ]);
            expect(mockClient.release).toHaveBeenCalledOnce();
        });

        test('passes correct values to insert query', async () => {
            const events = [
                { channelId: 'ch1', badword: 'bw', userId: 'u1', userName: 'user1', timestamp: 100 },
            ];
            await BadWordEventRepository.bulkInsert(events);
            // The second call (index 1) is the INSERT
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO badword_events'),
                ['ch1', 'bw', 'u1', 'user1', 100]
            );
        });
    });
});
