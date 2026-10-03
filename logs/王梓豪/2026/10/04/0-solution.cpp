#include <bits/stdc++.h>
using namespace std; 
map<char,int> mp;
int ans; 
vector<vector<string> >a;
bool check()
{
	 for(int i=1;i<ans+1;i++)
	 {
	 	for(int j=1;j<ans+1;j++)
	 	{
	 		int temp=mp[a[i][0][0]]+mp[a[0][j][0]];
	 		int size=a[i][j].size();
	 		if(size==1&&temp<ans){
	 			if(mp[a[i][j][0]]==temp)
	 			{
	 				continue;
				 }
				 else
				 return 0;
			 }
			 else if(size==2&&temp>=ans)
			 {
			 	if(mp[a[i][j][0]]==(temp/ans)&&mp[a[i][j][1]]==temp%ans)
			 	{
			 		continue;
				 }
				 else
				 return 0;
			 }
			 else
			 {return 0;
			 }
		 }
	 }
	 return 1;
}
int main()
{
	int n;
	cin>>n;ans=n-1;
	a.resize(n, vector<string>(n));
	for(int i=0;i<n;i++)
	{
		for(int j=0;j<n;j++)
		{
			cin>>a[i][j];
		}
	}
	vector<int> b(n-1);
	
	for(int i=0;i<n-1;i++){
	b[i]=i;}
	do
	{
		for(int i=0;i<n-1;i++){
		mp[a[i+1][0][0]]=b[i];}
		if(check())
		{for(int i=0;i<n-1;i++)cout<<a[i+1][0]<<'='<<b[i]<<' ';
		cout<<endl<<ans;
		return 0;
		}
		
	}
	while(next_permutation(b.begin(),b.end()));
	cout<<"ERROR!";
}