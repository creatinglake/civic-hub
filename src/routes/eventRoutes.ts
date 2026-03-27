import { Router } from "express";
import { handleGetEvents } from "../controllers/eventController.js";

const router = Router();

router.get("/", handleGetEvents);

export default router;
