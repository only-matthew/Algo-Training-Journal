#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int t;
    cin>>t;
    while (t--) {
        int n;
        cin>>n;
        int temp;
        for(int i=0;i<n-1;i++)
        {
        	cin>>temp;
		}
		cin>>n;
		vector<int> a(n);
		for(int i=0;i<n;i++) 
		{
			cin>>a[i];
		}
		int ans=n-1;
		sort(a.begin(),a.end());
		if(ans==0)
		{
			cout<<0<<endl;
		}
		else
		{
			cout<<ans<<' ';
			for(int i=1;i<n;i++)
			cout<<a[i]<<' ';
			cout<<endl;
		}
    }
    return 0;
}