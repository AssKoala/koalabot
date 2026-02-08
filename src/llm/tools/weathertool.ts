// const weatherTool = {
//     "type": "function",
//     "name": "get_weather",
//     "description": "Retrieves current weather and forecast for the given location.",
//     "parameters": {
//         "type": "object",
//         "properties": {
//             "location": {
//                 "type": "string",
//                 "description": "Location (zip code, geographical name, coordinates, etc) to get the current weather for."
//             },
//             "units": {
//                 "type": "string",
//                 "enum": ["celsius", "fahrenheit"],
//                 "description": "Units the temperature will be returned in."
//             }
//         },
//         "required": ["location", "units"],
//         "additionalProperties": false
//     },
//     "strict": true
// }