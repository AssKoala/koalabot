import { DiscordMessageCreateListener, TrackedWord, WordListener } from "../api/DiscordMessageListener.js";
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js';
import { Message } from 'discord.js';
import { Global } from "../global.js";
import { GetKoalaBotSystem } from "../api/KoalaBotSystem.js";
import { OpenAIHelper } from '../helpers/openaihelper.js';

namespace MessageResponderInternal {
    export enum MessageResponseType {
        Positive,
        Negative,
        Neutral,
        None
    }

    export interface MessageResponseSearch {
        id: string;
        className: string;
        getResponseType(runtimeData: DiscordBotRuntimeData, message: Message): Promise<MessageResponseType>;
    }

    export interface MessageResponseAction {
        id: string;
        className: string;
        performAction(runtimeData: DiscordBotRuntimeData, message: Message, responseType: MessageResponseType): Promise<void>;
    }

    export class MessageResponseSearchQueryAI implements MessageResponseSearch {
        id: string;
        initialSearchText: string[] = [];
        query: string;
        className: string;
        private lastQuery;

        constructor(id: string, query: string, initialSearchText) {
            this.id = id;
            this.query = query;
            this.initialSearchText = initialSearchText;
            this.className = this.constructor.name;
            this.lastQuery = 0;
        }

        async getResponseType(runtimeData: DiscordBotRuntimeData, message: Message) {
            try {
                let shouldQuery = false;
                let response = MessageResponseType.None;

                this.initialSearchText.every(text => {
                    if (message.content.toLowerCase().includes(text)) {
                        shouldQuery = true;
                        return false;
                    }    
                    return true;
                });

                if (shouldQuery) {
                    const currentTime = Date.now();
                    const timeSinceLastQuery = currentTime - this.lastQuery;

                    // Rate limit to once every 30 seconds
                    if (timeSinceLastQuery < 10000) return MessageResponseType.None;

                    const completion = await OpenAIHelper.getInterface().chat.completions.create({
                        model: "chatgpt-4o-latest",
                        messages: [
                            { "role": "user", "content": `${this.query}: ${message.content}` }
                        ]
                    });
                    
                    this.lastQuery = Date.now();

                    const responseText = completion.choices[0].message.content;

                    if (responseText.toLowerCase().includes("yes")) {
                        response = MessageResponseType.Positive;
                    } else if (responseText.toLowerCase().includes("no")) {
                        response = MessageResponseType.Negative;
                    }
                }
                
                return response;
            } catch (e) {
                GetKoalaBotSystem().getLogger().logError(`MessageResponseSearchQueryAI.getResponseType Failure!, got ${e}`);
            }
        }
    }

    export class MessageResponseActionReact implements MessageResponseAction {
        id: string;
        positiveReaction: string;
        negativeReaction: string;
        neutralReaction: string;
        className: string;

        constructor(id: string, positiveReaction = "", negativeReaction = "", neutralReaction = "") {
            this.id = id;
            this.positiveReaction = positiveReaction;
            this.negativeReaction = negativeReaction;
            this.neutralReaction = neutralReaction;
            this.className = this.constructor.name;
        }

        async performAction(runtimeData: DiscordBotRuntimeData, message: Message, responseType: MessageResponseType) {
            try {
                let reaction;
                switch (responseType) {
                    case MessageResponseType.Positive:
                        reaction = this.positiveReaction;
                        break;
                    case MessageResponseType.Negative:
                        reaction = this.negativeReaction;
                        break;
                    case MessageResponseType.Neutral:
                        reaction = this.neutralReaction;
                        break;
                }

                if (reaction) {
                    message.react(reaction).catch((e) => {
                        GetKoalaBotSystem().getLogger().logError(`Failed to react to message, got ${e}`);
                    });
                }
            } catch (e) {
                GetKoalaBotSystem().getLogger().logError(`Failed to perform message responder action, got ${e}`);
            }
        }
    }

    export class MessageResponseRule {
        search: MessageResponseSearch;
        action: MessageResponseAction;

        constructor(search, action) {
            this.search = search;
            this.action = action;
        }
    }

    export class MessageResponseDataSet {
        searches: MessageResponseSearch[] = [];
        actions: MessageResponseAction[] = [];
        rules: MessageResponseRule[] = [];
    }
}

class MessageResponder implements DiscordMessageCreateListener {
    private dataSet: MessageResponderInternal.MessageResponseDataSet;

    constructor(filePath: string = null) {
        try {
            GetKoalaBotSystem().getLogger().logInfo(`Loading message responder dataset from: ${filePath}`);
            if (filePath != null) {
                const data = Global.readJsonFileSync(filePath);
    
                if (data != null) {
                    this.dataSet = new MessageResponderInternal.MessageResponseDataSet()
    
                    data.searches.forEach(search => {
                        this.dataSet.searches.push(new (<any>MessageResponderInternal)[search.className](search.id, search.query, search.initialSearchText));
                    });
    
                    data.actions.forEach(action => {
                       this.dataSet.actions.push(new (<any>MessageResponderInternal)[action.className](action.id, action.positiveReaction, action.negativeReaction, action.neutralReaction)); 
                    });
    
                    data.rules.forEach(rule => {
                        let search = this.dataSet.searches.find(search => search.id == rule.searchid);
                        let action = this.dataSet.actions.find(action => action.id == rule.actionid);
                        this.dataSet.rules.push(new MessageResponderInternal.MessageResponseRule(search, action));
                    });
                }

                GetKoalaBotSystem().getLogger().logInfo(`Successfully loaded message responder dataset.`);
            } else {
                GetKoalaBotSystem().getLogger().logError(`Failed to load message responder dataset`);
            }
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to load message responder dataset, got ${e}`);
        }
    }
    
    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        try {
            for (let i = 0; i < this.dataSet.rules.length; i++) {
                const response = await this.dataSet.rules[i].search.getResponseType(runtimeData, message);
                await this.dataSet.rules[i].action.performAction(runtimeData, message, response);
            }
        } catch (e) {

        }
    }
}

GetKoalaBotSystem().registerDiscordMessageCreateListener(new MessageResponder(`${GetKoalaBotSystem().getEnvironmentVariable("DATA_PATH")}/${GetKoalaBotSystem().getEnvironmentVariable("MESSAGE_RESPONDER_DATASET_FILENAME")}`));