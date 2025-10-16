// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthContext } from '@asgardeo/auth-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Shield, Clock, Users, AlertCircle, Cpu } from 'lucide-react';
import LoadingScreen from '@/components/LoadingScreen';

const SignIn = () => {
  const { signIn, state } = useAuthContext();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.isAuthenticated) {
      navigate('/patient-match');
    }
  }, [state.isAuthenticated, navigate]);

  const handleSignIn = () => {
    setIsLoading(true);
    setError(null);
    try {
      signIn();
    } catch (err) {
      setError('Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  if (state.isLoading || isLoading) {
    return <LoadingScreen message="Signing you in..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
            <div className="flex justify-center mb-4">
            <img src="/image.png" alt="Health Sync Agent Logo" className="h-20 w-20" />
            </div>
          <h1 className="text-3xl font-bold text-gray-900">Healthcare Contact Center</h1>
          <p className="text-gray-600 mt-2">Healthcare agent dashboard and patient management</p>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>Agent Access</CardTitle>
            <CardDescription>Sign in to access patient information and support tools</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Error Display */}
            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">HIPAA Compliant Access</span>
              </div>
              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="text-sm text-gray-700">Patient Information Management</span>
              </div>
                <div className="flex items-center space-x-3">
                <Cpu className="h-5 w-5 text-teal-600" />
                <span className="text-sm text-gray-700">AI-Powered Assistance</span>
                </div>
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-orange-600" />
                <span className="text-sm text-gray-700">24/7 Support Dashboard</span>
              </div>
            </div>

            {/* Login Button */}
            <Button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>© 2025 Healthcare Contact Center. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
