/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Weather module.

    Pulls geocoding data from google maps API and uses weatherOne API for the weather.

    Weather one technically supports geocoding but its absolute shit.  Google maps API
    is consistently better and handles natural processing more good.
*/

import fetch from 'node-fetch';
import { Global } from './../global.js'; 
import validator from 'validator';
import { SlashCommandBuilder } from "discord.js";

import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'

/**
 * Map for type to excludes and print function
 */
const forecastTypeMap = [ 
    ["hourly", "minutely,current,daily,alerts", printHourlyForecast], 
    ["minutely", "hourly,current,daily,alerts", printMinutelyForecast],
    ["daily", "hourly,minutely,current,alerts", printDailyForecast],
    ["alerts", "hourly,minutely,current,daily", printAlertForecast]
 ];

const convertKelvinTo = [
    [ "celsius",    'C', (x) => { return Number(x) - 273.15; } ],
    [ "fahrenheit", 'F', (x) => { return ((Number(x) - 273.15) * (9/5)) + 32; } ],
    [ "rankine",    'R', (x) => { return Number(x) * 1.8; } ],
    [ "kelvin",     'K', (x) => { return Number(x); } ]
];

/**
 * Convert C to F
 * @param {string} temperatureCelsius - The temperature in Celsius
 * @returns {string} The temperature in Fahrenheit
 */
function celsiusToFahrenheit(temperatureCelsius)
{
	return (1.8 * Number(temperatureCelsius) + 32).toFixed(0);
}

/**
 * Get the temperature string formatted as expected for output (e.g. 86F/30C)
 * @param {string} temperatureKelvin - The temperature in Kelvin 
 * @returns {string} The temperature formatted for output
 */
function getTemperatureString(temperatureKelvin)
{
    try {
        let temperatureCelsius = temperatureKelvin - 273.15;
        return celsiusToFahrenheit(temperatureCelsius) + 'F/' + temperatureCelsius.toFixed(0) + 'C';
    } catch (e) {
        Global.logger().logErrorAsync(`Failed to convert temperature ${temperatureKelvin}, got ${e}`);
    }
}

/**
 * Convert 0-360 degrees into compass directions
 * @param {string} degrees - value in degrees (0-360)
 * @returns {string} compass direction of degrees passed in
 */
function degreesToCompass(degrees)
{
    try {
        var val = <any> (Number(degrees) / 22.5 + 5).toFixed(0);
        var directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

        return directions[val % 16];
    } catch (e) {
        Global.logger().logErrorAsync(`Failed to convert ${degrees}, got ${e}`);
        return -1;
    }
}

/**
 * Returns the user's preferred temperature units
 * @param {Discord.interaction} interaction - interaction sent to us from Discord API
 */
function getUserPreferredUnits(interaction) 
{
    try {
        const userData = Global.userSettings().get(interaction.user.username);

        if (userData) {
            return userData.weatherSettings.preferredUnits;
        }
    } catch (e) {
        Global.logger().logErrorAsync(`Failed to get preferred units, got ${e}`);
    }

    return "rankine";
}

/**
 * Gets the location requested by the user.  This is important since the location is optional.
 * Users can specify their location in the settings, so, if they don't specify a location, 
 * this will look it up and use it if it exists or tell them they're dumb if they haven't set it.
 * @param {*} interaction - discord interaction
 */
async function getWeatherLocation(interaction)
{
    let location = null;

    try {
        for (let i = 0; i < interaction.options.data.length; i++) {
            if (interaction.options.data[i].name == 'location') {
                location = interaction.options.data[i].value.trim();
                break;
            }
        }

        if (location === null) {
            const userData = Global.userSettings().get(interaction.user.username);

            if (userData) { // if the user data exists, we can use that for the location if none was specified
                try {
                    location = userData.weatherSettings.location;
                } catch (e) {
                    await Global.logger().logErrorAsync(`This is really bad, the user data is corrupted somehow! Got: ${e}`, interaction, true);
                    return null;
                }
            } else {
                await interaction.editReply('You need to either set your location with /settings or specify the location for the weather, pal.');
                return null;
            }
        }
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to get weather location, got ${e}`, interaction, true);
    }

    return location;
}

/**
 * Retrieve Geocode using Google Maps API
 * @param {Discord.interaction} interaction - Message sent to us from Discord API
 * @returns array containing [ {string}cityName, {string}latitude, {string}longitude ]
 */
async function getWeatherLocationGoogleMapsAPI(interaction)
{
    try {
        const key = Global.settings().get("GOOGLE_MAPS_API_KEY");
        const location = await getWeatherLocation(interaction);
        if (!location) {
            return null;
        }

        const query = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${key}`;
        if (!validator.isURL(query)) {
            Global.logger().logWarning(`Location passed in does not appear to be properly useable as a URL: ${location}`);
            await interaction.editReply("Whatever you wrote apparently doesn't work as a URL so maybe ask differently");
            return null;
        }

        try {
            const result = await fetch(query);
            const locationData = <any> await result.json();

            if (locationData.results.length > 0) {
                return [locationData.results[0].formatted_address, locationData.results[0].geometry.location.lat, locationData.results[0].geometry.location.lng];
            } else {
                await interaction.editReply(`Failed to get any geocoordinate results for ${location}, try being more specific maybe?`);
                return null;
            }
        } catch (e) {
            await Global.logger().logErrorAsync(`Failed to get geocoded data, got error: ${e}`, interaction, true);
            return null;
        }
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to get weather location using maps API, got ${e}`, interaction, true);
    }

}

/**
 * Get the weather data from the One API
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 * @param {string} excludes - Excludes to send to the one API to lower bandwidth usage
 * @returns the weather data in the One API v3 format or null on error.
 */
async function getWeatherUsingOneApiv3(locationData, interaction, excludes = "alerts")
{
    try {
        if (locationData.length != 3) {
            await Global.logger().logErrorAsync(`Trying to print API with incorrect location data: ${locationData}`, interaction, true);
            return null;
        }

        const city = locationData[0];
        const lat = locationData[1];
        const lon = locationData[2];
        const key = Global.settings().get("OPEN_WEATHER_KEY");

        Global.logger().logInfo(`Getting weather for ${city} @ lat=${lat}&lon=${lon}`);

        // modify as we extend functionality
        const apiCall = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=${excludes}&appid=${key}`;
        Global.logger().logInfo(`WeatherAPI Call: ${apiCall}`);

        try {
            const result = await fetch(apiCall);
            const weatherData = await result.json();
            Global.logger().logInfo('Received JSON data: ');
            Global.logger().logInfo(JSON.stringify(weatherData));

            return weatherData;
        } catch (e) {
            if (e.message.includes('ETIMEDOUT')) {
                await interaction.editReply('TImed out trying to get weather from One API, try again later');
            } else {
                await interaction.editReply(`${Global.settings().get("BOT_NAME")} breakdown trying to get the weather, check logs`);
            }

            Global.logger().logErrorAsync(`Failed to print out weather, got: ${e} from call ${apiCall}`, interaction, true);

            return null;
        }
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to get weather using one api, got ${e}`, interaction, true);
    }
}

/**
 * Print the weather data as a reply to the discord message
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
async function printWeatherUsingOneApiv3(locationData, interaction)
{
    try {
        const excludes = "minutely,hourly,alerts";
        const weatherData = <any> await getWeatherUsingOneApiv3(locationData, interaction, excludes);

        if (weatherData)
        {   
            const city = locationData[0];

            await interaction.editReply(
                `**${city} Weather** :: ${getTemperatureString(weatherData.current.temp)} (Humidity: ${weatherData.current.humidity}%)`
                + ` | **Feels Like:** ${getTemperatureString(weatherData.current.feels_like)}`
                + ` | **Dew Point:** ${getTemperatureString(weatherData.current.dew_point)}`
                + ` | **Wind:** ${degreesToCompass(weatherData.current.wind_deg)}@${weatherData.current.wind_speed}km/h`
                + ` | **Today's High:** ${getTemperatureString(weatherData.daily[0].temp.max)}`
                + ` | **Today's Low:** ${getTemperatureString(weatherData.daily[0].temp.min)}`
                + ` | **Current Conditions:** ${weatherData.current.weather[0].description}`
            );
        } 
    } catch (e) {
        await Global.logger().logErrorAsync(`Received malformed weather data, got error ${e}`, interaction, true);
    }
}

/**
 * Handles the /weather commands
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
async function handleWeatherCommand(interaction) {
    using perfCounter = Global.getPerformanceCounter("handleWeatherCommand(): ");

    try {
        await interaction.deferReply();

        let result;

        result = await getWeatherLocationGoogleMapsAPI(interaction);
        
        if (result != null)
        {
            printWeatherUsingOneApiv3(result, interaction);
        }        
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to handle weather command, got error: ${e}`, interaction, true);
    }

    
}

/**
 * Print the hourly forecast based on weatherData
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 * @param {JSON} weatherData - OneAPI weather data that includes hourly
 */
async function printHourlyForecast(locationData, interaction, weatherData) {
    try {
        let hourlyWeatherString = `**Hourly Forecast for ${locationData[0]}:** \n`;
        for (let i = 0; i < 5 && i < weatherData.hourly.length; i++) { 
            const tempStrFeels = getTemperatureString(weatherData.hourly[i].feels_like);
            const tempStr = getTemperatureString(weatherData.hourly[i].temp);
            hourlyWeatherString += `**:: ${i} hrs:** ${tempStr}, **Feels like:** ${tempStrFeels} ::  ${weatherData.hourly[i].humidity}% humidity, ${weatherData.hourly[i].weather[0].description}\n`;
        }

        await interaction.editReply(hourlyWeatherString);
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to generate hourly weather string, got ${e}`, interaction, true);
    }
}

/**
 * No one uses this
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 * @param {JSON} weatherData - OneAPI weather data that includes minutely
 */
async function printMinutelyForecast(locationData, interaction, weatherData) {
    try {
        let messageStr = `No precipitation expected in the next ${weatherData.minutely.length} minutes.`;

        if (weatherData.minutely[0].precipitation != 0) {
            messageStr = `It's probably raining right now, look outside.`;

            let found = false;
            for (let i = 1; i < weatherData.minutely.length; i++) {
                if (weatherData.minutely[i].precipitation == 0) {
                    messageStr += ` It should be over in ${i} minutes.`;
                    found = true;
                    break;
                }
            }

            if (!found) {
                messageStr += ` There's no end in sight.  Or at least for the next hour.`;
            }
        } else {
            let found = false;
            let rainStart = -1;

            for (let i = 0; i < weatherData.minutely.length; i++) {
                if (!found && weatherData.minutely[i].precipitation != 0) {
                    messageStr = `Precipitation expected to start in ${i} minutes.`;
                    rainStart = i;
                    found = true;
                }
                if (found && weatherData.minutely[i].precipitation == 0) {
                    messageStr += ` With a break in the rain in ${i} minutes.`;
                    found = false;
                    break;
                }
            }

            if (found) {
                const rainLeft = weatherData.minutely.length - rainStart;
                messageStr += ` For at least ${rainLeft} minutes.`;
            }
        }

        await interaction.editReply(`**Minutely forecast for ${locationData[0]}** :: ` + messageStr);
    }
    catch (e) {
        await Global.logger().logErrorAsync(`Failed to get minutely weather, got ${e}`, interaction, true);
    }
}

/**
 * Returns the shortened day string based on day index.  Automatically wraps around.
 * @param {number} day - index of day (0=Sunday, 6=Saturday)
 * @returns Shortened day string (e.g. Mon), ??? on error
 */
function getDayFromIndex(day) {
    const dayArray = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ];

    if (day > 32) {
        return "???";
    }

    while (day >= dayArray.length) {
        day -= dayArray.length;
    }

    return dayArray[day];
}

/**
 * Pull an emoji for weather based on the icon
 * @param {JSON} weather - weather object result from Open Weather
 * @returns emoji, description string otherwise
 */
function getEmojiFromConditions(weather) {
    // See: https://openweathermap.org/weather-conditions
    const conditionToEmojiMap = [
        [ "01", "☀️" ],
        [ "02", "🌤️" ],
        [ "03", "☁️" ],
        [ "04", "🌥️" ],
        [ "09", "🌦️" ],
        [ "10", "🌧️" ],
        [ "11", "🌩️" ],
        [ "13", "❄️" ],
        [ "50", "🌫️ "]
    ];

    for (let i = 0; i < conditionToEmojiMap.length; i++)
    {
        if (weather.icon.includes(conditionToEmojiMap[i][0]))
        {
            return conditionToEmojiMap[i][1];
        }
    }

    return weather.description;
}

/**
 * Print the daily (8-day) weather forecast
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 * @param {JSON} weatherData - OneAPI weather data that includes daily
 */
async function printDailyForecast(locationData, interaction, weatherData) {
    try {
        const preferredUnits = getUserPreferredUnits(interaction);
        let conversionMap = <any> convertKelvinTo[0];
        for (let i = 0; i < convertKelvinTo.length; i++)
        {
            if (preferredUnits == convertKelvinTo[i][0]) {
                conversionMap = convertKelvinTo[i];
            }
        }

        let dailyWeatherString = `**${locationData[0]}** :: 8-Day Forecast `;
        let date = new Date();

        for (let i = 0; i < 8 && i < weatherData.daily.length; i++)
        {
            const highTemp = `${conversionMap[2](weatherData.daily[i].temp.max).toFixed(0)}${conversionMap[1]}`;
            const lowTemp = `${conversionMap[2](weatherData.daily[i].temp.min).toFixed(0)}${conversionMap[1]}`;
            const tempStr = `:: **${getDayFromIndex(date.getDay()+i)}:** ${getEmojiFromConditions(weatherData.daily[i].weather[0])} (${highTemp}/${lowTemp})`;
            dailyWeatherString += tempStr;
        }

        await interaction.editReply(dailyWeatherString);
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to generate daily weather data, got ${e}`, interaction, true);
    }
}

/**
 * Print alerts for a given location based on weather data
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 * @param {JSON} weatherData - OneAPI weather data that includes alerts
 */
async function printAlertForecast(locationData, interaction, weatherData) {
    try {
        if (weatherData.alerts != null && weatherData.alerts.length > 0) {
            let alertStr = "**Active Alerts:**";

            for (let i = 0; i < weatherData.alerts.length; i++) {
                alertStr += ` :: **Event:** ${weatherData.alerts[i].event} **From:** ${weatherData.alerts[i].sender_name}`;
            }
            await interaction.editReply(alertStr);
        } else {
            await interaction.editReply(`No active alerts for ${locationData[0]}`);
        }
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to process the alert forecast, got ${e}`, interaction, true);
    }
}

/**
 * Get the forecast map data for a given type
 * @param {string} forecastType - "hourly", "daily", etc
 * @returns array from forecastTypeMap for the given type
 */
function getForecastMapData(forecastType)
{
    try {
        for (let i = 0; i < forecastTypeMap.length; i++) {
            if (forecastTypeMap[i][0] === forecastType) {
                return forecastTypeMap[i];
            }
        }
    } catch (e) {
        Global.logger().logErrorAsync(`Failed to get forecast map data, got ${e}`);
    }

    return null;
}

/**
 * Print the forecast data as a reply to the discord message
 * @param {array} locationData - [ {string}locationName, {string}latitude, {string}longitude ] 
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
async function printForecastUsingOneApiv3(locationData, interaction, forecastType)
{
    try {
        const forecastMapData = <any> getForecastMapData(forecastType);
        const weatherData = <any> await getWeatherUsingOneApiv3(locationData, interaction, forecastMapData[1]);

        if (weatherData) {
            await forecastMapData[2](locationData, interaction, weatherData);
        } else {
            Global.logger().logInfo(`Failed to get forecast data`);
        }
    } catch (e) {
        await Global.logger().logErrorAsync(`Received malformed weather data, got error ${e}`, interaction, true);
    }
}

/**
 * Retrieves the options as an array for the forecast
 * @param {Discord.message} interaction - Discord message to reply to
 * @returns [ forecastType, location ]
 */
async function getForecastOptions(interaction)
{
    try {
        let forecastType = null;
        let location = "";

        for (let i = 0; i < interaction.options.data.length; i++) {
            switch (interaction.options.data[i].name)
            {
                case 'forecasttype':
                    forecastType = interaction.options.data[i].value.trim();
                    break;
                case 'location':
                    location = interaction.options.data[i].value.trim();
                    break;
                default:
                    Global.logger().logWarning(`Got unexpected value in forecast interaction: ${interaction.options.data[i]}`);
            }
        }

        return [forecastType, location];
    } catch (e) {
        await Global.logger().logErrorAsync(`Error getting forecast options, got: ${e}`, interaction, true);
    }
}

/**
 * Handles the /forecast commands
 * @param {Discord.message} interaction - Discord interaction to reply to
 */
async function handleForecastCommand(interaction)
{
    using perfCounter = Global.getPerformanceCounter("handleForecastCommand(): ");

    try {
        await interaction.deferReply();

        let result;

        const forecastOptions = await getForecastOptions(interaction);

        if (!forecastOptions) {
            return;
        } else if (getForecastMapData(forecastOptions[0]) == null) {
            await Global.logger().logErrorAsync(`Unexpected forecast type received: ${forecastOptions[0]}`);
            return;
        }

        result = await getWeatherLocationGoogleMapsAPI(interaction);
        
        if (result != null)
        {
            printForecastUsingOneApiv3(result, interaction, forecastOptions[0]);
        }
    } catch (e) {
        await Global.logger().logErrorAsync(`Failed to handle weather command, got error: ${e}`, interaction, true);
    }

    
}

class WeatherCommand extends DiscordBotCommand {
    async handle(interaction) {
        return handleWeatherCommand(interaction);
    }

    get() {
        const weatherCommand = new SlashCommandBuilder()
                .setName(this.name())
                .setDescription('Get the current weather')
                .addStringOption((option) =>
                    option
                        .setName('location')
                        .setDescription("Location to get the weather for")
                        .setRequired(false)
                );
        return weatherCommand;
    }
}

class ForecastCommand extends DiscordBotCommand {
    async handle(interaction) {
        return handleForecastCommand(interaction);
    }

    get() {
        const forecastCommand = new SlashCommandBuilder()
                .setName(this.name())
                .setDescription('Get the forecast')
                .addStringOption((option) =>
                    option
                        .setName('forecasttype')
                        .setDescription("The type of forecast")
                        .addChoices(
                            { name: 'Daily', value: 'daily' },
                            { name: 'Hourly', value: 'hourly' },
                            { name: 'Minutely', value: 'minutely' },
                            { name: 'Alerts', value: 'alerts' },
                        )
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName('location')
                        .setDescription('Location for the forecast')
                        .setRequired(false),
                );
        return forecastCommand;
    }
}

registerDiscordBotCommand(new WeatherCommand('weather'), false);
registerDiscordBotCommand(new ForecastCommand('forecast'), false);
