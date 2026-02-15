import express from 'express'
import dotenv from 'dotenv'
import { UserRouter } from './routes/UserRouter'
import { ContentRouter } from './routes/ContentRouter'
import { BrainRouter } from './routes/BrainRouter'
import { GoogleAuthRouter } from './routes/GoogleAuthRouter'
import cors from 'cors'
dotenv.config()

const PORT = process.env.PORT || 3000

const app = express()

app.use(cors({
    origin: ['https://secondbrain-fe.vercel.app', 'http://localhost:5173', 'http://localhost:8080', 'http://localhost:4173', 'https://id-preview--fac48524-3e2f-4c80-94c6-2f03bdf252c4.lovable.app']
}))
app.use(express.json())
app.use('/v1/user', UserRouter)
app.use('/v1/content', ContentRouter)
app.use('/v1/brain', BrainRouter)
app.use('/api/auth', GoogleAuthRouter)

app.get('/', (req, res) => {
    res.status(200).json({
        message: "Brainly backend is up and running 🚀"
    })
})

app.listen(PORT)