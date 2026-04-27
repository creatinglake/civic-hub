import termsMd from "../content/legal/terms.md?raw";
import LegalPage from "../components/LegalPage";

export default function Terms() {
  return <LegalPage markdown={termsMd} title="Terms of Service" />;
}
