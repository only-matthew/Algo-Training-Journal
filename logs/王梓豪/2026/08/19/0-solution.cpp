#include <bits/stdc++.h>
using namespace std;
vector<int> a;
int cnt=0;
bool isprime(int n)
{
    if(n <= 1) return false;
    for(int i=2;i*i <= n; i++)
    {
        if(n%i == 0) return false;
    }
    return true;
}
void dfs(int rest,int total,int curr)
{
	if(rest==0)
	{
		if(isprime(total))
		{
			cnt++;
			return ;
		}
	}
	if((int)a.size()-curr<=rest)return;
	for(int i=curr+1;i<a.size();i++)
	{
		dfs(rest-1,total+a[i],i);
	}
}
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
	int n,k,temp;
	cin>>n>>k;
	for(int i=0;i<n;i++)
	{
		cin>>temp;
		a.emplace_back(temp);
	}
	dfs(k,0,-1);
	cout<<cnt;
}