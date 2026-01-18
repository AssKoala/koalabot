import * as KoalaBotSlashCommand from "../../../../api/koalabotslashcommand.js";
import { beforeEach, describe, expect, test } from 'vitest'

describe('KoalaBotSlashCommand', () => {
    const name = "name";
    const desc = "desc";
    const value = "value";

    function TestNameAndDescription(command: any, name: string, desc: string) {
        expect(command.getName()).toBe(name);
        expect(command.getDescription()).toBe(desc);
        
        command.setName(null);
        expect(command.getName()).toBe(null);
        
        command.setDescription(null);
        expect(command.getDescription()).toBe(null);
    }

    describe("KoalaCommand", () => {
        let command: KoalaBotSlashCommand.KoalaCommand;

        beforeEach(() => {
            command = new KoalaBotSlashCommand.KoalaCommand(name, desc);
        });

        test('Initialization', () => {
            expect(command.getName()).toBe(name);
            expect(command.getDescription()).toBe(desc);
        });

        test('Modify', () => {
            // @ts-ignore
            command.setName(null);
            // @ts-ignore
            command.setDescription(null);

            expect(command.getName()).toBe(null);
            expect(command.getDescription()).toBe(null);
        });
    });

    describe("KoalaCommandChoice", () => {
        test('Usage', () => {
            const command = new KoalaBotSlashCommand.KoalaCommandChoice(name, value, desc);

            expect(command.getName()).toBe(name);
            expect(command.getDescription()).toBe(desc);
            expect(command.getValue()).toBe(value);

            expect(command.hasValue()).toBe(true);
        });
    });

    describe("KoalaBotSlashCommandArgument", () => {
        let command: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;

        beforeEach(() => {
            command = new KoalaBotSlashCommand.KoalaBotSlashCommandArgument(name, desc, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Any);
        });

        test('Initialization', () => {
            TestNameAndDescription(command, name, desc);

            expect(command.isRequired()).toBe(false);
            expect(command.getChoices().length).toBe(0);
        });

        test('Modify', () => {            
            command.setRequired(true);
            expect(command.isRequired()).toBe(true);

            command.addChoice(name, value, desc);
            expect(command.getChoices().length).toBe(1);
            expect(command.getChoices()[0].getName()).toBe(name);
            expect(command.getChoices()[0].getValue()).toBe(value);
            expect(command.getChoices()[0].getDescription()).toBe(desc);
        });
    });


    function TestArguments(command: any, argOne: KoalaBotSlashCommand.KoalaBotSlashCommandArgument, argTwo: KoalaBotSlashCommand.KoalaBotSlashCommandArgument) {
        expect(command.getArguments().length).toBe(0);
        expect(command.hasArgument("arbitrary")).toBe(false);

        command.addArgument(argOne);

        expect(() => {(command.addArgument(argOne))}).toThrow();
        expect(command.hasArgument(argOne.getName())).toBe(true);

        expect(command.getArgument("argTwo")).toBe(undefined);
        command.addArgument(argTwo);
        expect(command.getArgument(argTwo.getName())).toBe(argTwo);
    }

    describe("KoalaBotSlashCommand", () => {
        let argOne: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;
        let argTwo: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;

        const choiceOne = { 
            name: "c1Name",
            value: "c1Value",
            description: "c1Description",
        }

        const koalaCmdChoiceOne = new KoalaBotSlashCommand.KoalaCommandChoice(choiceOne.name, choiceOne.value, choiceOne.description);

        const choiceTwo = { 
            name: "c2Name",
            value: "c2Value",
            description: "c2Description",
        }
        const koalaCmdChoiceTwo = new KoalaBotSlashCommand.KoalaCommandChoice(choiceTwo.name, choiceTwo.value, choiceTwo.description);

        describe("KoalaBotSlashSubCommand", () => {
            let command: KoalaBotSlashCommand.KoalaBotSlashSubcommand;

            beforeEach(() => {
                command = new KoalaBotSlashCommand.KoalaBotSlashSubcommand(name, desc);
                
                argOne = new KoalaBotSlashCommand.KoalaBotSlashCommandArgument("argOneName", "argOneDesc", KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Any, true, [koalaCmdChoiceOne]);
                argTwo = new KoalaBotSlashCommand.KoalaBotSlashCommandArgument("argTwoName", "argTwoDesc", KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Any, false, [koalaCmdChoiceOne, koalaCmdChoiceTwo]);
            });
    
            test('Initialization', () => {
                TestNameAndDescription(command, name, desc);
                         
            });
    
            test('Modify', () => {
                TestArguments(command, argOne, argTwo);   
            });
        });

        describe("KoalaBotSlashCommand", () => {
            let command: KoalaBotSlashCommand.KoalaBotSlashCommand;
            let subcommand: KoalaBotSlashCommand.KoalaBotSlashSubcommand;
            const groupName = "group";
    
            beforeEach(() => {
                command = new KoalaBotSlashCommand.KoalaBotSlashCommand(name, desc);
                subcommand = new KoalaBotSlashCommand.KoalaBotSlashSubcommand("subCommandName", "subCommandDesc");
            });
    
            test('Initialization', () => {
                TestNameAndDescription(command, name, desc);

                expect(command.getGroups().length).toEqual(0);

                expect(() => {command.getSubcommands(groupName)}).toThrow();
                command.addSubcommandToGroup(groupName, subcommand);
                expect(command.getSubcommands(groupName).length).toBe(1);
                expect(() => {command.addSubcommandToGroup(groupName, subcommand)}).toThrow();
            });
    
            test('Modify', () => {
                TestArguments(command, argOne, argTwo);
            });
        }); 
    });
});
