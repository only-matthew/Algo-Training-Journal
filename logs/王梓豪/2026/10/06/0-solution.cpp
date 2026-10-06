#include<iostream>
#include <vector> 
using namespace std;
vector<int> a(1000);int n,k,ans;vector<int> f(1000);
void dfs(int x)
{
	if(x==k)
	{
		int dp[3000]={0};
		int i=0;
		while(dp[i]<=n)
		{   i++;
			dp[i]=INT_MAX;
			for(int j=0;j<k&&i-f[j]>=0;j++)
			dp[i]=min(dp[i],dp[i-f[j]]+1);
			
		}
		if(i-1>ans)
		{
			for(int j=0;j<k;j++)
			{
				a[j]=f[j];
			}
			ans=i-1;
		}
		return ;
	}
	for(int i=f[x-1]+1;i<=f[x-1]*n+1;i++)
        {
            f[x]=i;
            dfs(x+1);
        }
}
int main()
{
	
	cin>>n>>k;
	f[0]=1;
	dfs(1);
	for(int i=0;i<k;i++)
	{
		cout<<a[i]<<' ';
	}
	cout<<endl<<"MAX="<<ans;
}