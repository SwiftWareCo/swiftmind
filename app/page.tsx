import { createClient } from '../server/supabase/server'
import { cookies } from 'next/headers'
import { Todo } from '../lib/types/index'

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: todos } = await supabase.from('todos').select() as { data: Todo[] }


  return (
    <div>
    <ul>
      {todos?.map((todo, index) => (
          <li key={index}>{todo.todo}</li>
        ))}
      </ul>
    </div>
  )
}
