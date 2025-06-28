import { Global } from "../../__mocks__/global.js";
import { MessageCache } from "../../helpers/messagecache.js";
import { DiscordStenographerMessage } from "../../helpers/discordstenographermessage.js";

const maxEntries = 3;
let messageCache: MessageCache;
let messages: DiscordStenographerMessage[];

beforeAll(() => {
    Global.init();
    messageCache = new MessageCache(maxEntries);
    messages = [
        new DiscordStenographerMessage("guildId", "channelId", "testauthor", "testauthorid", "testmessage", Date.now()),
        new DiscordStenographerMessage("guildId2", "channelId2", "testauthor2", "testauthorid2", "testmessage2", Date.now()),
        new DiscordStenographerMessage("guildId3", "channelId3", "testauthor2", "testauthorid3", "testmessage3", Date.now()),
        new DiscordStenographerMessage("guildId4", "channelId4", "testauthor4", "testauthorid4", "testmessage4", Date.now())
    ];
});

describe("MessageCache", () => {
    describe("Empty Tests", () => {
        test('maxEntries(): empty', () => {
            expect(messageCache.maxEntries()).toBe(maxEntries);
        });
        test('messages(): empty', () => {
            expect(messageCache.messages().length).toBe(0);
            expect(messageCache.getMessageCount()).toBe(0);
        });
    });
    describe("Data Tests", () => {
        test('pushMessage(msg): valid', () => {
            for (let i = 0; i < maxEntries; i++) {
                messageCache.pushMessage(messages[i]);
                expect(messageCache.messages().length).toBe(i+1);
            }
        });
        test('getMessagesCountBy(author): valid', () => {
            expect(messageCache.getMessagesCountBy("testauthor")).toBe(1);
            expect(messageCache.getMessagesCountBy("testauthor2")).toBe(2);
        });
        test('popMessage(msg): valid', () => {
            messageCache.popMessage();
            expect(messageCache.messages().length).toBe(2);

            messageCache.popMessage();
            expect(messageCache.messages().length).toBe(1);

            messageCache.popMessage();
            expect(messageCache.messages().length).toBe(0);
        });
        test('overflow', () => {
            messages.forEach((message) => {
                messageCache.pushMessage(message);
            });
            expect(messageCache.getMessageCount()).toBe(maxEntries);
            expect(messageCache.getMessagesCountBy("testauthor")).toBe(0);
        });
    });
});
