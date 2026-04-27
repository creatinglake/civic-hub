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
      <FeedFilter active={active} onChange={setActive} />
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
