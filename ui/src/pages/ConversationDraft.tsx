import { useNavigate } from "react-router-dom";
import HostDeliberationForm from "../components/deliberation/HostDeliberationForm";

export default function ConversationDraft() {
  const navigate = useNavigate();

  return (
    <div className="page page-home">
      <div className="draft-page-header">
        <button
          type="button"
          className="draft-back-link"
          onClick={() => navigate(-1)}
        >
          &larr; Back
        </button>
        <h1 className="draft-page-title">Start a conversation</h1>
      </div>

      <HostDeliberationForm
        onCreated={() => navigate("/deliberations")}
        onCancel={() => navigate(-1)}
        onSubmittedForReview={(reviewId) => navigate(`/my-submissions/${reviewId}`, { state: { submitted: true } })}
      />
    </div>
  );
}
