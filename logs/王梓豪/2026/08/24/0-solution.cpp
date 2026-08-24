#include <bits/stdc++.h>
using namespace std;
int main()
{
int  n;
    cin>>n;
    double tw=0.0,tv=0.0,temp;
    for(int i=0;i<n;i++)
    {cin>>temp;tv+=temp;}
    for(int i=0;i<n;i++)
      { cin>>temp;tw+=temp;}
    cout<<fixed<<setprecision(6)<<tw/tv<<endl;
}