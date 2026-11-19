import type { AdminPage } from "../api/manager";
import { useAsyncData } from "./useAsyncData";

export function useAdminPage<T>(
  fetchPage: (page: number) => Promise<AdminPage<T>>,
) {
  let requestedPage = 1;
  const {
    data,
    loading,
    error,
    load: fetch,
  } = useAsyncData(async () => {
    let page = requestedPage;
    let result = await fetchPage(page);
    // A decision or withdrawal can remove the last item from the current page.
    while (!result.items.length && result.page > 1) {
      page = result.page - 1;
      result = await fetchPage(page);
    }
    return result;
  });

  async function load() {
    await fetch();
    if (!loading.value && !error.value && data.value) {
      requestedPage = data.value.page;
    }
  }

  function changePage(page: number) {
    if (loading.value || page < 1) return;
    requestedPage = page;
    return load();
  }

  return { data, loading, error, load, changePage };
}
