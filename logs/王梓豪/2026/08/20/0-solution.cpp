#include <bits/stdc++.h>
using namespace std;
void solve(int n)
{
	if(n%2==0)cout<<"NO"<<endl;
	else cout<<"YES"<<endl;
}
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
	int n;int temp;
	for(int i=0;i<n;i++)
	{
		cin>>temp;
		solve(temp);
	}
}