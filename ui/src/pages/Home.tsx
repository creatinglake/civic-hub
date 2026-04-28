import { Link } from "react-router-dom";
import HubInfo from "../components/HubInfo";
import Feed from "../components/Feed";
import FeedFilter, {
  useFeedFilter,
  useFilterPredicate,
} from "../components/FeedFilter";

export default function Home() {
  const { active, setActive } = useFeedFilter();
  const filter = useFilterPredicate(active);

  return (
    <div className="page page-home">
      <HubInfo />
      {/* Slice 12 — pair the filter pills with a primary CTA so the
          most action-oriented thing (suggesting a new vote) is one
          tap away from the feed without burying it in the hamburger.
          The wrapper handles wrapping on narrow screens — pills can
          horizontally scroll while the button stays anchored on the
          row below if there's no room. */}
      <div className="home-action-row">
        <FeedFilter active={active} onChange={setActive} />
        <Link to="/propose" className="home-suggest-vote-button">
          + Suggest a vote
        </Link>
      </div>
      <Feed
        filter={filter}
        emptyFilteredAction={
          active === "all"
            ? null
            : { label: "Show all activity", onClick: () => setActive("all") }
        }
      />
    </div>
  );
}
