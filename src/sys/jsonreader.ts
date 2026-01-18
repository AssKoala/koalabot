import { getCommonLogger } from "../logging/logmanager.js";
import fs from 'fs';
import fsPromises from "fs/promises";

export async function readJsonFile(path: string) {
    try {
        const file = await fsPromises.readFile(path, {encoding: "utf8"});
        return JSON.parse(file);
    } catch (e) {
        getCommonLogger().logErrorAsync(`Failed to load ${path}, got ${e}`);
        return null;
    }
}

export function readJsonFileSync(path: string) {
    try {
        const file = fs.readFileSync(path, {encoding: "utf8"});
        return JSON.parse(file);
    } catch (e) {
        getCommonLogger().logErrorAsync(`Failed to load ${path}, got ${e}`);
        return null;
    }
}
