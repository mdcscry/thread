import { authenticateApiKey, optionalAuth } from '../middleware/auth.js'
import WeatherService from '../services/WeatherService.js'
import bcrypt from 'bcrypt'

let weatherService = null

export default async function weatherRoutes(fastify, opts) {
  if (!weatherService) {
    weatherService = new WeatherService()
  }

  // Get current weather
  fastify.get('/weather', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { location, lat, lon } = request.query

    if (lat && lon) {
      return weatherService.getCurrentWeather(parseFloat(lat), parseFloat(lon))
    }

    if (location) {
      return weatherService.getWeatherForLocation(location)
    }

    // Return 400 if no location params provided
    return reply.code(400).send({ error: 'Location parameter required (location, or lat+lon)' })
  })

  // Get forecast
  fastify.get('/weather/forecast', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { location, lat, lon, days = 7 } = request.query

    let weatherLat = lat ? parseFloat(lat) : null
    let weatherLon = lon ? parseFloat(lon) : null

    if (location && !weatherLat) {
      const geo = await weatherService.geocode(location)
      if (geo) {
        weatherLat = geo.lat
        weatherLon = geo.lon
      }
    }

    if (!weatherLat || !weatherLon) {
      weatherLat = 40.015
      weatherLon = -105.2705
    }

    return weatherService.getForecast(weatherLat, weatherLon, parseInt(days))
  })

  // Geocode a location
  fastify.get('/weather/geocode', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { q } = request.query

    if (!q) {
      return reply.code(400).send({ error: 'Query parameter q is required' })
    }

    return weatherService.geocode(q)
  })
}
