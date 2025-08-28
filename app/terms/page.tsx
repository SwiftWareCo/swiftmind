import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm" className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to SwiftMind
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Acceptance of Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                By accessing and using SwiftMind (&quot;the Service&quot;), you accept and agree to be bound by 
                the terms and provision of this agreement. If you do not agree to abide by the above, 
                please do not use this service.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description of Service</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                SwiftMind is an intelligent workspace platform that provides AI-powered tools and 
                collaboration features for teams and organizations.
              </p>
              
              <h4>Service Features Include:</h4>
              <ul>
                <li>AI-powered chat and assistance</li>
                <li>Knowledge management and retrieval</li>
                <li>Team collaboration tools</li>
                <li>Document processing and analysis</li>
                <li>Integration capabilities</li>
                <li>User and permission management</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Accounts and Responsibilities</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h4>Account Creation:</h4>
              <ul>
                <li>Accounts are created by invitation only</li>
                <li>You must provide accurate and complete information</li>
                <li>You are responsible for maintaining account security</li>
                <li>One person may not maintain multiple accounts</li>
              </ul>
              
              <h4>Acceptable Use:</h4>
              <ul>
                <li>Use the service only for lawful purposes</li>
                <li>Do not attempt to gain unauthorized access</li>
                <li>Do not upload malicious content or viruses</li>
                <li>Respect intellectual property rights</li>
                <li>Do not spam or send unsolicited messages</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data and Privacy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                Your privacy is important to us. Our collection and use of personal information 
                is governed by our Privacy Policy, which is incorporated into these terms by reference.
              </p>
              
              <h4>Data Ownership:</h4>
              <ul>
                <li>You retain ownership of content you upload</li>
                <li>You grant us license to process your content to provide services</li>
                <li>We do not claim ownership of your data</li>
                <li>You can export or delete your data</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service Availability</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                While we strive to provide reliable service, we do not guarantee uninterrupted 
                access to SwiftMind.
              </p>
              
              <h4>Service Limitations:</h4>
              <ul>
                <li>Scheduled maintenance may cause temporary unavailability</li>
                <li>Service levels may vary based on usage and demand</li>
                <li>We reserve the right to modify or discontinue features</li>
                <li>Third-party integrations may have their own limitations</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing and Subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h4>Payment Terms:</h4>
              <ul>
                <li>Subscription fees are billed in advance</li>
                <li>Prices may change with 30 days notice</li>
                <li>Refunds are provided according to our refund policy</li>
                <li>Accounts may be suspended for non-payment</li>
              </ul>
              
              <h4>Cancellation:</h4>
              <ul>
                <li>You may cancel your subscription at any time</li>
                <li>Service continues until the end of the billing period</li>
                <li>Data retention policies apply after cancellation</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                To the maximum extent permitted by law, SwiftMind shall not be liable for any 
                indirect, incidental, special, consequential, or punitive damages resulting from 
                your use of the service.
              </p>
              
              <h4>Disclaimers:</h4>
              <ul>
                <li>Service is provided &quot;as is&quot; without warranties</li>
                <li>AI-generated content may contain errors</li>
                <li>We are not responsible for third-party content</li>
                <li>Users are responsible for backing up their data</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Termination</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                We reserve the right to terminate or suspend accounts that violate these terms 
                or for any other reason at our discretion.
              </p>
              
              <h4>Termination Process:</h4>
              <ul>
                <li>Notice will be provided when possible</li>
                <li>Data export options may be provided</li>
                <li>Refunds are handled according to our refund policy</li>
                <li>These terms survive account termination</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changes to Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                We reserve the right to modify these terms at any time. Material changes will be 
                communicated to users with reasonable notice.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <p>
                  <strong>Email:</strong>{" "}
                  <a href="mailto:legal@swiftmind.app" className="text-primary hover:underline">
                    legal@swiftmind.app
                  </a>
                </p>
                <p>
                  <strong>Support:</strong>{" "}
                  <a href="mailto:support@swiftmind.app" className="text-primary hover:underline">
                    support@swiftmind.app
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
