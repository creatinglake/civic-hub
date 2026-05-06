import { Router } from "express";
import { requireFederationEnabled } from "../middleware/federation.js";
import {
  handleGetActor,
  handleWebfinger,
  handleInbox,
  handleOutbox,
  handleGetProcessAP,
  handleCreateTestProcess,
} from "../controllers/federationController.js";

const federationRoutes = Router();

federationRoutes.get("/actor", requireFederationEnabled, handleGetActor);
federationRoutes.post("/inbox", requireFederationEnabled, handleInbox);
federationRoutes.get("/outbox", requireFederationEnabled, handleOutbox);
federationRoutes.post("/federation/test-process", requireFederationEnabled, handleCreateTestProcess);

export const webfingerRouter = Router();
webfingerRouter.get("/webfinger", requireFederationEnabled, handleWebfinger);

export const processApRouter = Router();
processApRouter.get("/:id.json", requireFederationEnabled, handleGetProcessAP);

export default federationRoutes;
