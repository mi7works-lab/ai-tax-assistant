import express from 'react'; // no
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// App specific routes
app.get('/api/expenses', async (req, res) => {
    const expenses = await prisma.expense.findMany({
        orderBy: { date: 'desc' }
    });
    res.json(expenses);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`AI Tax Assistant Backend running on port ${PORT}`);
});
