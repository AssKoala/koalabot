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
import validator from 'validator';
import { SlashCommandBuilder } from "discord.js";

import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { getCommonLogger } from '../logging/logmanager.js';
import { PerformanceCounter } from '../performancecounter.js';
import config from 'config';
import { UserSettingsManager } from '../app/user/usersettingsmanager.js';
import * as Discord from 'discord.js'


interface WeatherLocationData {
    locationName: string;
    latitude: string;
    longitude: string;
}

interface ForecastMapData {
    forecastType: string;
    location: string;
}

function convertKelvinToPreferredUnits(temperatureKelvin: number, preferredUnits: string): number {
    switch (preferredUnits) {
        case "celsius":
            return temperatureKelvin - 273.15;
        case "fahrenheit":
            return ((temperatureKelvin - 273.15) * (9/5)) + 32;
        case "rankine":
            return temperatureKelvin * 1.8;
        case "kelvin":
            return temperatureKelvin;
        default:
            return NaN;
    }
}

function celsiusToFahrenheit(temperatureCelsius: number): string
{
	return (1.8 * Number(temperatureCelsius) + 32).toFixed(0);
}

function getTemperatureString(temperatureKelvin: number): string
{
    const temperatureCelsius = temperatureKelvin - 273.15;
    return celsiusToFahrenheit(temperatureCelsius) + 'F/' + temperatureCelsius.toFixed(0) + 'C';
}

function degreesToCompass(degrees: number): string
{
    const val = Math.floor(Number(degrees) / 22.5 + 5);
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

    return directions[val % 16];
}

function getUserPreferredUnits(interaction: Discord.ChatInputCommandInteraction): string
{
    try {
        const userData = UserSettingsManager.get().get(interaction.user.username);

        if (userData) {
            return userData.weatherSettings.preferredUnits;
        }
    } catch (e) {
        getCommonLogger().logErrorAsync(`Failed to get preferred units, got ${e}`);
    }

    return "rankine";
}

async function getWeatherLocation(interaction: Discord.ChatInputCommandInteraction): Promise<string | undefined>
{
    let location = undefined;

    try {
        for (let i = 0; i < interaction.options.data.length; i++) {
            if (interaction.options.data[i].name == 'location') {
                location = interaction.options!.data![i].value!.toString().trim();
                break;
            }
        }

        if (location === undefined) {
            const userData = UserSettingsManager.get().get(interaction.user.username);

            if (userData) { // if the user data exists, we can use that for the location if none was specified
                try {
                    location = userData.weatherSettings.location;
                } catch (e) {
                    await getCommonLogger().logErrorAsync(`This is really bad, the user data is corrupted somehow! Got: ${e}`, interaction, true);
                    return undefined;
                }
            } else {
                await interaction.editReply('You need to either set your location with /settings or specify the location for the weather, pal.');
                return undefined;
            }
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to get weather location, got ${e}`, interaction, true);
    }

    return location;
}

async function getWeatherLocationGoogleMapsAPI(interaction: Discord.ChatInputCommandInteraction): Promise<WeatherLocationData | undefined>
{
    try {
        const key = config.get("APIKey.googleMaps");
        const location = await getWeatherLocation(interaction);
        if (!location) {
            return undefined;
        }

        const query = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${key}`;
        if (!validator.isURL(query)) {
            getCommonLogger().logWarning(`Location passed in does not appear to be properly useable as a URL: ${location}`);
            await interaction.editReply("Whatever you wrote apparently doesn't work as a URL so maybe ask differently");
            return undefined;
        }

        try {
            const result = await fetch(query);
            const locationData = <any> await result.json(); // eslint-disable-line @typescript-eslint/no-explicit-any

            if (locationData.results.length > 0) {
                return { 
                    locationName: locationData.results[0].formatted_address, 
                    latitude: locationData.results[0].geometry.location.lat, 
                    longitude: locationData.results[0].geometry.location.lng 
                };
            } else {
                await interaction.editReply(`Failed to get any geocoordinate results for ${location}, try being more specific maybe?`);
                return undefined;
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to get geocoded data, got error: ${e}`, interaction, true);
            return undefined;
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to get weather location using maps API, got ${e}`, interaction, true);
    }

}

async function getWeatherUsingOneApiv3(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction, excludes = "alerts")
{
    try {
        const city = locationData.locationName;
        const lat = locationData.latitude;
        const lon = locationData.longitude;
        const key = config.get("APIKey.openWeather");

        getCommonLogger().logInfo(`Getting weather for ${city} @ lat=${lat}&lon=${lon}`);

        // modify as we extend functionality
        const apiCall = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=${excludes}&appid=${key}`;
        getCommonLogger().logInfo(`WeatherAPI Call: ${apiCall}`);

        try {
            const result = await fetch(apiCall);
            const weatherData = await result.json();
            getCommonLogger().logInfo('Received JSON data: ');
            getCommonLogger().logInfo(JSON.stringify(weatherData));

            return weatherData;
        } catch (e: any) {  // eslint-disable-line @typescript-eslint/no-explicit-any
            if ('message' in e && e.message.includes('ETIMEDOUT')) {
                await interaction.editReply('Timed out trying to get weather from One API, try again later');
            } else {
                await interaction.editReply(`${config.get("Global.botName")} breakdown trying to get the weather, check logs`);
            }

            getCommonLogger().logErrorAsync(`Failed to print out weather, got: ${e} from call ${apiCall}`, interaction, true);

            return undefined;
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to get weather using one api, got ${e}`, interaction, true);
    }
}

async function printWeatherUsingOneApiv3(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction)
{
    try {
        const excludes = "minutely,hourly,alerts";
        const weatherData = <any> await getWeatherUsingOneApiv3(locationData, interaction, excludes);   // eslint-disable-line @typescript-eslint/no-explicit-any

        if (weatherData)
        {   
            const city = locationData.locationName;

            if ('editReply' in interaction) {
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
        } 
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Received malformed weather data, got error ${e}`, interaction, true);
    }
}


async function handleWeatherCommand(interaction: Discord.ChatInputCommandInteraction) {
    using perfCounter = PerformanceCounter.Create("handleWeatherCommand(): ");

    try {
        if ('deferReply' in interaction) {
            await interaction.deferReply();
        }

        const result = await getWeatherLocationGoogleMapsAPI(interaction);
        
        if (result != null)
        {
            printWeatherUsingOneApiv3(result, interaction);
        }        
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to handle weather command, got error: ${e}`, interaction, true);
    }

    
}

async function printHourlyForecast(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction, weatherData: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
        let hourlyWeatherString = `**Hourly Forecast for ${locationData.locationName}:** \n`;
        for (let i = 0; i < 5 && i < weatherData.hourly.length; i++) { 
            const tempStrFeels = getTemperatureString(weatherData.hourly[i].feels_like);
            const tempStr = getTemperatureString(weatherData.hourly[i].temp);
            hourlyWeatherString += `**:: ${i} hrs:** ${tempStr}, **Feels like:** ${tempStrFeels} ::  ${weatherData.hourly[i].humidity}% humidity, ${weatherData.hourly[i].weather[0].description}\n`;
        }

        await interaction.editReply(hourlyWeatherString);
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to generate hourly weather string, got ${e}`, interaction, true);
    }
}

async function printMinutelyForecast(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction, weatherData: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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

        await interaction.editReply(`**Minutely forecast for ${locationData.locationName}** :: ` + messageStr);
    }
    catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to get minutely weather, got ${e}`, interaction, true);
    }
}

function getDayFromIndex(day: number): string {
    const dayArray = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ];

    if (day > 32) {
        throw new Error(`Got invalid day index: ${day}`);
    }

    while (day >= dayArray.length) {
        day -= dayArray.length;
    }

    return dayArray[day];
}

function getEmojiFromConditions(weather: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
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

async function printDailyForecast(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction, weatherData: any) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
        const preferredUnits = getUserPreferredUnits(interaction);
        const unitsShort = preferredUnits[0].toUpperCase();

        let dailyWeatherString = `**${locationData.locationName}** :: 8-Day Forecast `;
        const date = new Date();

        for (let i = 0; i < 8 && i < weatherData.daily.length; i++)
        {
            const highTemp = `${convertKelvinToPreferredUnits(weatherData.daily[i].temp.max, preferredUnits).toFixed(0)}${unitsShort}`;
            const lowTemp = `${convertKelvinToPreferredUnits(weatherData.daily[i].temp.min, preferredUnits).toFixed(0)}${unitsShort}`;
            const tempStr = `:: **${getDayFromIndex(date.getDay()+i)}:** ${getEmojiFromConditions(weatherData.daily[i].weather[0])} (${highTemp}/${lowTemp})`;
            dailyWeatherString += tempStr;
        }

        await interaction.editReply(dailyWeatherString);
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to generate daily weather data, got ${e}`, interaction, true);
    }
}

async function printAlertForecast(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction, weatherData: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
        if (weatherData.alerts != null && weatherData.alerts.length > 0) {
            let alertStr = "**Active Alerts:**";

            for (let i = 0; i < weatherData.alerts.length; i++) {
                alertStr += ` :: **Event:** ${weatherData.alerts[i].event} **From:** ${weatherData.alerts[i].sender_name}`;
            }
            await interaction.editReply(alertStr);
        } else {
            await interaction.editReply(`No active alerts for ${locationData.locationName}`);
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to process the alert forecast, got ${e}`, interaction, true);
    }
}

function getWeatherExcludeForForecastType(forecastType: string): string
{
    switch (forecastType) {
        case "hourly":
            return "minutely,current,daily,alerts";
        case "minutely":
            return "hourly,current,daily,alerts";
        case "daily":
            return "hourly,minutely,current,alerts";
        case "alerts":
            return "hourly,minutely,current,daily";
        default:
            getCommonLogger().logWarning(`Got unexpected forecast type: ${forecastType}`);
            return "";
    }
}

async function printForecastUsingOneApiv3(locationData: WeatherLocationData, interaction: Discord.ChatInputCommandInteraction, forecastType: string)
{
    try {
        const weatherData = await getWeatherUsingOneApiv3(locationData, interaction, getWeatherExcludeForForecastType(forecastType));

        if (weatherData) {
            switch (forecastType) {
                case "hourly":
                    await printHourlyForecast(locationData, interaction, weatherData);
                    break;
                case "minutely":
                    await printMinutelyForecast(locationData, interaction, weatherData);
                    break;
                case "daily":
                    await printDailyForecast(locationData, interaction, weatherData);
                    break;
                case "alerts":
                    await printAlertForecast(locationData, interaction, weatherData);
                    break;
                default:
                    getCommonLogger().logWarning(`Got unexpected forecast type: ${forecastType}`);
            }
        } else {
            getCommonLogger().logInfo(`Failed to get forecast data`);
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Received malformed weather data, got error ${e}`, interaction, true);
    }
}

async function getForecastOptions(interaction: Discord.ChatInputCommandInteraction): Promise<ForecastMapData | undefined>
{
    try {
        let forecastType = "";
        let location = "";

        for (let i = 0; i < interaction.options.data.length; i++) {
            switch (interaction.options.data[i].name)
            {
                case 'forecasttype':
                    forecastType = interaction.options!.data![i].value!.toString().trim();
                    break;
                case 'location':
                    location = interaction.options!.data![i].value!.toString().trim();
                    break;
                default:
                    getCommonLogger().logWarning(`Got unexpected value in forecast interaction: ${interaction.options.data[i]}`);
            }
        }

        return { forecastType, location };
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Error getting forecast options, got: ${e}`, interaction, true);
    }
}

async function handleForecastCommand(interaction: Discord.ChatInputCommandInteraction)
{
    using perfCounter = PerformanceCounter.Create("handleForecastCommand(): ");

    try {
        await interaction.deferReply();

        const forecastOptions = await getForecastOptions(interaction);

        if (!forecastOptions) {
            return;
        } else if (forecastOptions.forecastType == "") {
            await getCommonLogger().logErrorAsync(`Unexpected forecast type received: ${forecastOptions.forecastType}`);
            return;
        }

        const result = await getWeatherLocationGoogleMapsAPI(interaction);
        
        if (result != null)
        {
            printForecastUsingOneApiv3(result, interaction, forecastOptions.forecastType);
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to handle weather command, got error: ${e}`, interaction, true);
    }

    
}

class WeatherCommand extends DiscordBotCommand {
    async handle(interaction: Discord.ChatInputCommandInteraction) {
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
    async handle(interaction: Discord.ChatInputCommandInteraction) {
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
