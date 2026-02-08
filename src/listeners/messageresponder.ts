import { DiscordMessageCreateListener, TrackedWord, WordListener } from "../api/discordmessagelistener.js";
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js';
import { Message } from 'discord.js';
import { GetKoalaBotSystem } from "../api/koalabotsystem.js";
import { OpenAiApi } from '../llm/api/openai.js';
import { readJsonFileSync } from '../sys/jsonreader.js'
import config from 'config';

namespace MessageResponderInternal {
    export enum MessageResponseType {
        Positive,
        Negative,
        Neutral,
        None,
        Found
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

    export class MessageResponseSearchSimple implements MessageResponseSearch {
        id: string;
        searchText: string[];
        className: string;
        constructor(id: string, searchText: string[]) {
            this.id = id;
            this.searchText = searchText;
            this.className = this.constructor.name;
        }

        async getResponseType(runtimeData: DiscordBotRuntimeData, message: Message) {
            let response = MessageResponseType.None;

            this.searchText.every(text => {
                if (message.content.toLowerCase().match(text) != null) {
                    response = MessageResponseType.Found;
                    return false;
                }
                return true;
            });

            return response;
        }

        static Create(data: any): MessageResponseSearchSimple  {
            try {
                const search = new (<any>MessageResponderInternal)[data.className](data.id, data.searchText);
                return search;
            } catch (e) {
                // @ts-expect-error todo cleanup tech debt
                return null;
            }
        }
    }
    
    export class MessageResponseSearchQueryAI implements MessageResponseSearch {
        id: string;
        initialSearchText: string[] = [];
        query: string;
        className: string;
        private lastQuery;

        // @ts-expect-error todo cleanup tech debt
        constructor(id: string, query: string, initialSearchText) {
            this.id = id;
            this.query = query;
            this.initialSearchText = initialSearchText;
            this.className = this.constructor.name;
            this.lastQuery = 0;
        }

        // @ts-expect-error todo cleanup tech debt
        async getResponseType(runtimeData: DiscordBotRuntimeData, message: Message) {
            try {
                let shouldQuery = false;
                let response = MessageResponseType.None;

                this.initialSearchText.every(text => {
                    if (message.content.toLowerCase().match(text) != null) {
                        shouldQuery = true;
                        return false;
                    }
                    return true;
                });

                if (shouldQuery) {
                    const currentTime = Date.now();
                    const timeSinceLastQuery = currentTime - this.lastQuery;

                    const rateLimit = parseInt(GetKoalaBotSystem().getConfigVariable("Listeners.MessageResponder.aiCooldownMs"));

                    if (timeSinceLastQuery < rateLimit) return MessageResponseType.None;

                    const completion = await OpenAiApi.simpleQuery(config.get<string>("Chat.aiModelNano"), 
                                                                    `${this.query}: ${message.content}`);
                    
                    // Reset the query timer
                    this.lastQuery = Date.now();

                    const responseText = completion.choices[0].message.content;

                    // @ts-expect-error todo cleanup tech debt
                    if (responseText.toLowerCase().includes("positive")) {
                        response = MessageResponseType.Positive;
                    } // @ts-expect-error todo cleanup tech debt 
                    else if (responseText.toLowerCase().includes("negative")) {
                        response = MessageResponseType.Negative;
                    } // @ts-expect-error todo cleanup tech debt 
                    else if (responseText.toLowerCase().includes("neutral")) {
                        response = MessageResponseType.Neutral;
                    }
                }
                
                return response;
            } catch (e) {
                GetKoalaBotSystem().getLogger().logError(`MessageResponseSearchQueryAI.getResponseType Failure!, got ${e}`);
            }
        }

        static Create(data: any): MessageResponseSearchQueryAI  {
            try {
                const search = new (<any>MessageResponderInternal)[data.className](data.id, data.query, data.initialSearchText);
                return search;
            } catch (e) {
                // @ts-expect-error todo cleanup tech debt
                return null;
            }
        }
    }

    export class MessageResponseActionSimpleReaction implements MessageResponseAction {
        id: string;
        reaction: string;
        className: string;

        constructor(id: string, reaction: string) {
            this.id = id;
            this.reaction = reaction;
            this.className = this.constructor.name;
        }

        async performAction(runtimeData: DiscordBotRuntimeData, message: Message, responseType: MessageResponseType) {
            try {
                if (responseType == MessageResponseType.Found) {
                    message.react(this.reaction).catch((e) => {
                        GetKoalaBotSystem().getLogger().logError(`Failed to react to message, got ${e}`);
                    });
                }
            } catch (e) {
                GetKoalaBotSystem().getLogger().logError(`MessageResponseActionSimpleReaction.performAction Failure!, got ${e}`);
            }
        }

        static Create(data: any): MessageResponseActionSimpleReaction  {
            try {
                const action = new (<any>MessageResponderInternal)[data.className](data.id, data.reaction);
                return action;
            } catch (e) {
                // @ts-expect-error todo cleanup tech debt
                return null;
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

        static Create(data: any): MessageResponseActionReact  {
            try {
                const action = new (<any>MessageResponderInternal)[data.className](data.id, data.positiveReaction, data.negativeReaction, data.neutralReaction);
                return action;
            } catch (e) {
                // @ts-expect-error todo cleanup tech debt
                return null;
            }
        }
    }

    export class MessageResponseRule {
        search: MessageResponseSearch;
        action: MessageResponseAction;

        // @ts-expect-error todo cleanup tech debt
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

export class MessageResponder implements DiscordMessageCreateListener {
    // @ts-expect-error todo cleanup tech debt
    private dataSet: MessageResponderInternal.MessageResponseDataSet;

    // @ts-expect-error todo cleanup tech debt
    constructor(filePath: string = null) {
        try {
            GetKoalaBotSystem().getLogger().logInfo(`Loading message responder dataset from: ${filePath}`);
            if (filePath != null) {
                const data = readJsonFileSync(filePath);
    
                if (data != null) {
                    this.dataSet = new MessageResponderInternal.MessageResponseDataSet();
    
                    // @ts-expect-error todo cleanup tech debt
                    data.searches.forEach(search => {
                        const newSearch = (<any>MessageResponderInternal)[search.className].Create(search);
                        if (newSearch != null) {
                            this.dataSet.searches.push(newSearch);    
                        } else {
                            GetKoalaBotSystem().getLogger().logError(`Failed to parse ${search}`);
                        }
                    });
    
                    // @ts-expect-error todo cleanup tech debt
                    data.actions.forEach(action => {
                        const newAction = (<any>MessageResponderInternal)[action.className].Create(action);
                        if (newAction != null) {
                            this.dataSet.actions.push(newAction);
                        } else {
                            GetKoalaBotSystem().getLogger().logError(`Failed to parse ${action}`);
                        }
                    });
    
                    // @ts-expect-error todo cleanup tech debt
                    data.rules.forEach(rule => {
                        let search = this.dataSet.searches.find(search => search.id == rule.searchid);
                        let action = this.dataSet.actions.find(action => action.id == rule.actionid);

                        if (search != null && action != null) {
                            this.dataSet.rules.push(new MessageResponderInternal.MessageResponseRule(search, action));
                        } else {
                            GetKoalaBotSystem().getLogger().logError(`Failed to parse ${rule}`);
                        }
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
    
    async onDiscordMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        try {
            if (message.author.bot) return;

            for (let i = 0; i < this.dataSet.rules.length; i++) {
                const response = await this.dataSet.rules[i].search.getResponseType(runtimeData, message);
                await this.dataSet.rules[i].action.performAction(runtimeData, message, response);
            }
        } catch (e) {

        }
    }
}

GetKoalaBotSystem().registerDiscordMessageCreateListener(new MessageResponder(`${GetKoalaBotSystem().getConfigVariable("Global.dataPath")}/${GetKoalaBotSystem().getConfigVariable("Listeners.MessageResponder.datasetFilename")}`));