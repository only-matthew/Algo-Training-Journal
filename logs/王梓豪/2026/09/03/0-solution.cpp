#include <bits/stdc++.h>
using namespace std;

int main()
{int n;
	cin>>n;
	vector<int> v(n);
	for(int i=0;i<n;i++)
	{cin>>v[i];
	}
	vector<int> dp(n);
	dp[0]=1;
	for(int i=1;i<n;i++)
	{
		for(int j=0;j<i;j++)
		{
			if(v[i]<=v[j])
			{
				dp[i]=max(dp[i],dp[j]+1);
			}
			else
			{
				dp[i]=max(dp[i],1);
			}
		}
	}
	int max_=-1;
	for(int i=0;i<n;i++)
	{
		max_=max(max_,dp[i]);
	}
	cout<<max_;
}