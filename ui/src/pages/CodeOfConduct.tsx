import codeOfConductMd from "../content/legal/code-of-conduct.md?raw";
import LegalPage from "../components/LegalPage";

export default function CodeOfConduct() {
  return <LegalPage markdown={codeOfConductMd} title="Code of Conduct" />;
}
