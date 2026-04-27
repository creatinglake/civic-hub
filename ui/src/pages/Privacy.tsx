import privacyMd from "../content/legal/privacy.md?raw";
import LegalPage from "../components/LegalPage";

export default function Privacy() {
  return <LegalPage markdown={privacyMd} title="Privacy Policy" />;
}
