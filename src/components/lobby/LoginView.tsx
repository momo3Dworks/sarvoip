
"use client";

import { useContext, useState } from 'react';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Globe } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(1, {
    message: "Password cannot be empty.",
  }),
});


export function LoginView() {
  const { loginWithGoogle, loginWithEmail } = useContext(UserContext);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      // Error is handled in the provider
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsEmailLoading(true);
    try {
      await loginWithEmail(values.email, values.password);
    } catch (error) {
       // Error is handled in the provider
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-card/80 backdrop-blur-[6px] border-primary/20">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to SARVOX</CardTitle>
          <CardDescription>Sign in to join the lobby.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEmailLogin)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="name@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isEmailLoading}>
                {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In with Email
              </Button>
            </form>
          </Form>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          
          <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={isGoogleLoading}>
            {isGoogleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Globe className="mr-2 h-5 w-5" />
            )}
            Sign In with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
