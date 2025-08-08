import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/server/supabase/server";
import { MembershipRow } from "@/server/memberships/memberships.data";

export default async function AppHomePage() {
  const supabase = await createClient();
  const { data: memberships } = await supabase.from("memberships").select() as { data: MembershipRow[] };

  return (
    <div className='flex flex-col items-center justify-center h-screen'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Memberships</CardTitle>
          <CardDescription>A list of your memberships</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col gap-2'>
            {memberships?.map((membership) => (
              <div key={membership.id}>
                <p>{membership.id}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


