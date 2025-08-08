import { createServerSupabase } from "@/server/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Todo } from "@/lib/types";

export default async function AppHomePage() {
  const supabase = await createServerSupabase();
  const { data: todos } = await supabase.from("todos").select() as { data: Todo[] };

  return (
    <div className='flex flex-col items-center justify-center h-screen'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Todos</CardTitle>
          <CardDescription>A list of your todos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col gap-2'>
            {todos?.map((todo, index) => (
              <div key={index} className='flex items-center justify-between'>
                <p>{todo.todo}</p>
                <Button>Delete</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


