import { SetKoalaBotSystem } from "../api/koalabotsystem.js";
import { GetKoalaBotSystem } from "../api/__mocks__/koalabotsystem.js";

export abstract class Global {
    static init() {
        
    }
    static logger() {
        throw new Error("Not yet implemented");
    }
}

if (process.env.JEST_WORKER_ID !== undefined) {
    SetKoalaBotSystem(GetKoalaBotSystem());
}