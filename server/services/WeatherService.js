import fetch from 'node-fetch'

const WEATHER_API_BASE = process.env.WEATHER_API_BASE || 'https://api.open-meteo.com/v1'

// Default location (Boulder, CO)
const DEFAULT_LAT = 40.015
const DEFAULT_LON = -105.2705

export class WeatherService {
  async getCurrentWeather(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
      const url = `${WEATHER_API_BASE}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`)
      }

      const data = await response.json()
      
      return {
        temp_f: Math.round(data.current.temperature_2m),
        feels_like_f: Math.round(data.current.apparent_temperature),
        humidity: data.current.relative_humidity_2m,
        precipitation_in: data.current.precipitation,
        wind_mph: Math.round(data.current.wind_speed_10m),
        condition: this.mapWeatherCode(data.current.weather_code),
        condition_code: data.current.weather_code,
        location: { lat, lon },
        fetched_at: new Date().toISOString()
      }
    } catch (error) {
      console.error('Weather fetch error:', error)
      // Return reasonable defaults on error
      return {
        temp_f: 65,
        condition: 'clear',
        condition_code: 0,
        error: error.message
      }
    }
  }

  async getForecast(lat = DEFAULT_LAT, lon = DEFAULT_LON, days = 7) {
    try {
      const url = `${WEATHER_API_BASE}/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=${days}`
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`)
      }

      const data = await response.json()
      
      return data.daily.time.map((date, i) => ({
        date,
        temp_max_f: Math.round(data.daily.temperature_2m_max[i]),
        temp_min_f: Math.round(data.daily.temperature_2m_min[i]),
        precipitation_in: data.daily.precipitation_sum[i],
        condition: this.mapWeatherCode(data.daily.weather_code[i])
      }))
    } catch (error) {
      console.error('Forecast fetch error:', error)
      return []
    }
  }

  mapWeatherCode(code) {
    // WMO Weather interpretation codes
    const codes = {
      0: 'clear',
      1: 'mostly_clear',
      2: 'partly_cloudy',
      3: 'overcast',
      45: 'fog',
      48: 'fog',
      51: 'drizzle',
      53: 'drizzle',
      55: 'drizzle',
      61: 'rain',
      63: 'rain',
      65: 'rain',
      71: 'snow',
      73: 'snow',
      75: 'snow',
      77: 'snow_grains',
      80: 'rain_showers',
      81: 'rain_showers',
      82: 'rain_showers',
      85: 'snow_showers',
      86: 'snow_showers',
      95: 'thunderstorm',
      96: 'thunderstorm',
      99: 'thunderstorm'
    }
    return codes[code] || 'unknown'
  }

  // Geocode a location string
  async geocode(location) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Geocoding error: ${response.statusText}`)
      }

      const data = await response.json()
      if (data.results && data.results.length > 0) {
        const result = data.results[0]
        return {
          lat: result.latitude,
          lon: result.longitude,
          name: result.name,
          country: result.country,
          admin1: result.admin1
        }
      }
      return null
    } catch (error) {
      console.error('Geocoding error:', error)
      return null
    }
  }

  // Get weather for a location string
  async getWeatherForLocation(location) {
    const geo = await this.geocode(location)
    if (!geo) {
      return this.getCurrentWeather()
    }
    return this.getCurrentWeather(geo.lat, geo.lon)
  }
}

export default WeatherService
