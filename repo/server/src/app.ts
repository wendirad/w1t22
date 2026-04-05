import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requestId } from './middleware/request-id';
import { errorHandler } from './middleware/error-handler';
import { fieldMask } from './middleware/field-mask';
import routes from './routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(requestId);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(fieldMask);

app.use('/api/v1', routes);

app.use(errorHandler);

export default app;
