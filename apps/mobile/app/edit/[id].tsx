import { useLocalSearchParams } from "expo-router";
import { CreateEventFlow } from "../../src/components/create/CreateEventFlow";

/** Organizer edits an existing event with the same steps as creation (autosaved per step). */
export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CreateEventFlow editEventId={id} />;
}
