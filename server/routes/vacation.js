import { authenticateApiKey } from '../middleware/auth.js'
import VacationPlanner from '../services/VacationPlanner.js'

let planner = null

export default async function vacationRoutes(fastify, opts) {
  if (!planner) {
    planner = new VacationPlanner()
  }

  // Plan a trip
  fastify.post('/vacation/plan', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const constraints = request.body

    if (!constraints.activities || constraints.activities.length === 0) {
      return reply.code(400).send({ error: 'activities is required' })
    }

    try {
      const result = await planner.planTrip(userId, constraints)
      return result
    } catch (err) {
      fastify.log.error(err, 'Vacation plan error')
      return reply.code(500).send({ error: err.message || 'Failed to plan trip' })
    }
  })

  // List trips
  fastify.get('/vacation', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    try {
      return planner.listTrips(userId)
    } catch (err) {
      fastify.log.error(err, 'Error listing trips')
      return reply.code(500).send({ error: err.message || 'Failed to list trips' })
    }
  })

  // Get trip
  fastify.get('/vacation/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    try {
      const trip = planner.getTrip(userId, id)
      if (!trip) {
        return reply.code(404).send({ error: 'Trip not found' })
      }
      return trip
    } catch (err) {
      fastify.log.error(err, 'Error getting trip')
      return reply.code(500).send({ error: err.message || 'Failed to get trip' })
    }
  })
}
