import { Global } from '../global.js';

class SortedArray
{
    #array = null;
    #comparisonFunction = null;
    #accessFunction = null;

    static defaultCompare(left, right) {
        if (left < right) return -1;
        else if (left > right) return 1;
        else return 0;
    }

    static defaultAccessElement(index) {
        //return this.#array[index];
    }

    constructor(array,
        compareFunction = SortedArray.defaultCompare,
        accessFunction = SortedArray.defaultAccessElement)
    {
        this.#array = array;
        this.#comparisonFunction = compareFunction;
        this.#accessFunction = accessFunction;
    }

    getIndexOf(entry) {
        const array = this.#array;
        const compareFunc = this.#comparisonFunction;

        try {
            let start = 0;
            let end = array.length - 1;
            let iterations = 0;

            while (start <= end) {
                let middle = Math.floor((start + end) / 2);

                let result = compareFunc(this.#accessFunction(middle), entry);

                if (result < 0) {
                    return start = middle + 1;
                } else if (result > 0) {
                    return end = middle - 1;
                } else {    // 0
                    return middle;
                }
                iterations++;
            }
        } catch (e) {
            Global.logger().logError(`Failed to getIndexOf(${array},${entry},${compareFunc}), got ${e}`);
        }

        return -1;
    }

    findEntry(entry) {
        try {
            
        } catch (e) {

        }
    }
}

export { SortedArray }