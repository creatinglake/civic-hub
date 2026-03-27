import { Router } from "express";
import { handleDiscoveryManifest } from "../controllers/discoveryController.js";

const router = Router();

router.get("/civic.json", handleDiscoveryManifest);

export default router;
