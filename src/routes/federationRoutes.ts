import { Router } from "express";
import { requireFederationEnabled } from "../middleware/federation.js";
import {
  handleGetActor,
  handleWebfinger,
  handleInbox,
  handleOutbox,
  handleGetProcessAP,
} from "../controllers/federationController.js";

const federationRoutes = Router();

federationRoutes.get("/actor", requireFederationEnabled, handleGetActor);
federationRoutes.post("/inbox", requireFederationEnabled, handleInbox);
federationRoutes.get("/outbox", requireFederationEnabled, handleOutbox);

export const webfingerRouter = Router();
webfingerRouter.get("/webfinger", requireFederationEnabled, handleWebfinger);

export const processApRouter = Router();
processApRouter.get("/:id.json", requireFederationEnabled, handleGetProcessAP);

export default federationRoutes;
