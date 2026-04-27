// Slice 10.5 — search routes.

import { Router } from "express";
import { handleSearch } from "../controllers/searchController.js";

const router = Router();

router.get("/", handleSearch);

export default router;
